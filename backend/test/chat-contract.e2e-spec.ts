import request from 'supertest';
import http from 'node:http';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { ChatService } from '../src/chat/chat.service';
import { EmbeddingService } from '../src/embedding/embedding.service';
import { ContentMetadata } from '../src/embedding/entities/content-metadata.entity';
import { createContractApp } from './contracts/contract-app';
import {
  completionResponse,
  embeddingResponse,
  streamFrame,
  streamResponse,
} from './contracts/openai-fixtures';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

interface Call {
  path: string;
  body: Record<string, unknown>;
  signal?: AbortSignal | null;
}
interface Event {
  event: string;
  data: unknown;
}

function events(text: string): Event[] {
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const [event, data] = frame.split('\n');
      return {
        event: event.slice('event: '.length),
        data: JSON.parse(data.slice('data: '.length)) as unknown,
      };
    });
}

function deadline<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('계약 검사 완료 시간 초과')),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

describe('채팅 실제 SDK·업무·HTTP SSE 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let calls: Call[];
  let unexpected: string[];
  let respond: (call: Call) => Response | Promise<Response>;
  const message = JSON.stringify({
    recommendations: [],
    message: '안녕하세요.',
    followUpQuestion: '',
  });

  beforeEach(async () => {
    calls = [];
    unexpected = [];
    respond = () => streamResponse(message);
    harness = await createContractApp({
      openaiKey: 'contract-openai-key',
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.startsWith('https://api.openai.com/v1/')) {
          unexpected.push(url);
          throw new Error('미등록 OpenAI fixture URL');
        }
        expect(init?.method).toBe('POST');
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer contract-openai-key',
        );
        if (typeof init?.body !== 'string')
          throw new Error('OpenAI JSON body가 없습니다.');
        const body: unknown = JSON.parse(init.body);
        if (typeof body !== 'object' || body === null || Array.isArray(body))
          throw new Error('잘못된 OpenAI 요청');
        const call: Call = {
          path: new URL(url).pathname,
          body: body as Record<string, unknown>,
          signal: init?.signal,
        };
        calls.push(call);
        return respond(call);
      },
    });
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
  });

  afterEach(async () => {
    if (!harness) return;
    try {
      expect(harness.unexpected).toEqual([]);
      expect(unexpected).toEqual([]);
      expect(harness.httpCalls).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  async function seedRecommendation() {
    const content = await fixtures.content({
      tmdbId: 101,
      title: '계약 드라마',
      posterUrl: '/poster.jpg',
    });
    await fixtures.contentMetadata({ contentId: content.id });
    return content;
  }

  function knowledgeResponse(call: Call): Response {
    if (call.path === '/v1/embeddings')
      return embeddingResponse(call.body.encoding_format);
    return completionResponse(
      JSON.stringify({
        ottProviderNames: [],
        countries: [],
        excludeCountries: [],
        personNames: [],
        referenceTitles: [],
        dateRange: null,
        contentType: 'movie',
        genres: ['드라마'],
        confidence: 'high',
      }),
    );
  }

  function recommendationJson(reason: string) {
    return JSON.stringify({
      recommendations: [{ tmdbId: 101, contentType: 'movie', reason }],
      message: '',
      followUpQuestion: '',
    });
  }

  it('동일 입력과 metadata 없는 상태는 실제 SDK를 거쳐 같은 SSE 배열을 반환해야 한다', async () => {
    for (let run = 0; run < 2; run++) {
      const response = await request(harness.app.getHttpServer())
        .post('/api/chat/messages')
        .send({ content: '안녕' })
        .expect(201);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['x-accel-buffering']).toBe('no');
      expect(events(response.text)).toEqual([
        { event: 'text', data: { content: '안녕하세요.' } },
        { event: 'done', data: {} },
      ]);
    }
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning_effort: 'medium',
      max_completion_tokens: 4096,
      stream: true,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'filmott_chat_response', strict: true },
      },
    });
    expect(calls[0].body.messages).toEqual(calls[1].body.messages);
    expect(await db.getRepository(ContentMetadata).count()).toBe(0);
  });

  it.each([false, true])(
    '부분 text 이후 reset과 재시도 종료 계약을 유지해야 한다 (최종 실패=%s)',
    async (failAgain) => {
      await seedRecommendation();
      let attempt = 0;
      respond = (call) => {
        if (!call.body.stream) return knowledgeResponse(call);
        attempt++;
        return streamResponse(
          recommendationJson(attempt === 1 ? '이전 이유' : '최종 이유'),
          attempt === 1 || failAgain ? 'length' : 'stop',
        );
      };
      const batch = jest.spyOn(
        harness.app.get<EmbeddingService>(EmbeddingService),
        'batchCacheByContentIds',
      );
      let response: request.Response;
      try {
        response = await request(harness.app.getHttpServer())
          .post('/api/chat/messages')
          .send({ content: '드라마 영화 추천해줘' })
          .expect(201);
      } finally {
        const settled = await Promise.allSettled(
          batch.mock.results
            .filter((result) => result.type === 'return')
            .map((result) => result.value),
        );
        batch.mockRestore();
        expect(
          settled.filter((result) => result.status === 'rejected'),
        ).toEqual([]);
      }
      const result = events(response.text);
      expect(result).toEqual([
        { event: 'text', data: { content: '**계약 드라마**' } },
        { event: 'reset', data: {} },
        { event: 'text', data: { content: '**계약 드라마**' } },
        ...(failAgain
          ? [
              { event: 'reset', data: {} },
              {
                event: 'error',
                data: {
                  message:
                    'AI 응답이 완성되기 전에 종료되었습니다. 다시 시도해주세요.',
                },
              },
            ]
          : [
              { event: 'text', data: { content: ' - 최종 이유' } },
              {
                event: 'recommendations',
                data: {
                  recommendations: [
                    {
                      tmdbId: 101,
                      contentType: 'movie',
                      title: '계약 드라마',
                      posterUrl: '/poster.jpg',
                    },
                  ],
                },
              },
              { event: 'done', data: {} },
            ]),
      ]);
      expect(calls).toHaveLength(4);
      const messages = calls[3].body.messages as { content: string }[];
      expect(messages[0].content).toContain('응답 재생성');
    },
  );

  it('DTO·잘못된 JWT는 SSE 시작과 외부 요청 전에 거부해야 한다', async () => {
    const api = () =>
      request(harness.app.getHttpServer()).post('/api/chat/messages');
    await api().send({ content: '' }).expect(400);
    await api()
      .send({ content: 'x'.repeat(501) })
      .expect(400);
    await api()
      .send({
        content: '안녕',
        history: [{ role: 'system', content: 'invalid' }],
      })
      .expect(400);
    await api()
      .auth('invalid-token', { type: 'bearer' })
      .send({ content: '안녕' })
      .expect(401);
    expect(calls).toEqual([]);
  });

  it('API key 비활성 상태는 외부 요청 없이 기존 SSE 오류로 종료해야 한다', async () => {
    await harness.close();
    harness = await createContractApp();
    db = harness.app.get(DataSource);
    const response = await request(harness.app.getHttpServer())
      .post('/api/chat/messages')
      .send({ content: '안녕' })
      .expect(201);
    expect(events(response.text)).toEqual([
      {
        event: 'error',
        data: { message: 'AI 추천 기능이 현재 비활성화 상태입니다.' },
      },
    ]);
    expect(calls).toEqual([]);
  });

  it.each([false, true])(
    'SDK의 429 재시도 2회와 종료 결과를 보존해야 한다 (소진=%s)',
    async (exhausted) => {
      let attempts = 0;
      respond = () => {
        attempts++;
        if (!exhausted && attempts === 3) return streamResponse(message);
        return Response.json(
          { error: { message: 'quota fixture', type: 'rate_limit_error' } },
          { status: 429, headers: { 'retry-after-ms': '1' } },
        );
      };
      const response = await request(harness.app.getHttpServer())
        .post('/api/chat/messages')
        .send({ content: '안녕' })
        .expect(201);
      expect(calls).toHaveLength(3);
      if (exhausted)
        expect(events(response.text)).toEqual([
          { event: 'error', data: { message: '429 quota fixture' } },
        ]);
      else
        expect(events(response.text)).toEqual([
          { event: 'text', data: { content: '안녕하세요.' } },
          { event: 'done', data: {} },
        ]);
    },
  );

  it('익명 5회와 로그인 10회 제한은 별도 tracker를 사용해야 한다', async () => {
    const user = await fixtures.user();
    const token = harness.app.get(JwtService).sign({ sub: user.id });
    for (let index = 0; index < 5; index++)
      await request(harness.app.getHttpServer())
        .post('/api/chat/messages')
        .send({ content: '안녕' })
        .expect(201);
    await request(harness.app.getHttpServer())
      .post('/api/chat/messages')
      .send({ content: '안녕' })
      .expect(429);
    for (let index = 0; index < 10; index++)
      await request(harness.app.getHttpServer())
        .post('/api/chat/messages')
        .auth(token, { type: 'bearer' })
        .send({ content: '안녕' })
        .expect(201);
    await request(harness.app.getHttpServer())
      .post('/api/chat/messages')
      .auth(token, { type: 'bearer' })
      .send({ content: '안녕' })
      .expect(429);
    expect(calls).toHaveLength(15);
  });

  it('실제 intent·embedding·SQL 후보는 추천 event와 기존 metadata 재사용으로 연결되어야 한다', async () => {
    const content = await fixtures.content({
      tmdbId: 101,
      title: '계약 드라마',
      posterUrl: '/poster.jpg',
    });
    await fixtures.contentMetadata({ contentId: content.id });
    respond = (call) => {
      if (call.path === '/v1/embeddings')
        return embeddingResponse(call.body.encoding_format);
      if (call.body.stream)
        return streamResponse(
          JSON.stringify({
            recommendations: [
              { tmdbId: 101, contentType: 'movie', reason: '고정 추천 이유' },
            ],
            message: '추천합니다.',
            followUpQuestion: '',
          }),
        );
      return completionResponse(
        JSON.stringify({
          ottProviderNames: [],
          countries: [],
          excludeCountries: [],
          personNames: [],
          referenceTitles: [],
          dateRange: null,
          contentType: 'movie',
          genres: ['드라마'],
          confidence: 'high',
        }),
      );
    };
    const batch = jest.spyOn(
      harness.app.get<EmbeddingService>(EmbeddingService),
      'batchCacheByContentIds',
    );
    try {
      const response = await request(harness.app.getHttpServer())
        .post('/api/chat/messages')
        .send({ content: '드라마 영화 추천해줘' })
        .expect(201);
      const result = events(response.text);
      expect(
        result.filter((event) => event.event === 'recommendations'),
      ).toEqual([
        {
          event: 'recommendations',
          data: {
            recommendations: [
              {
                tmdbId: 101,
                contentType: 'movie',
                title: '계약 드라마',
                posterUrl: '/poster.jpg',
              },
            ],
          },
        },
      ]);
      expect(result[result.length - 1]).toEqual({ event: 'done', data: {} });
      expect(
        result.some(
          (event) => event.event === 'error' || event.event === 'reset',
        ),
      ).toBe(false);
      expect(batch).toHaveBeenCalledWith([content.id]);
    } finally {
      const settled = await Promise.allSettled(
        batch.mock.results
          .filter((result) => result.type === 'return')
          .map((result) => result.value),
      );
      batch.mockRestore();
      expect(settled.filter((result) => result.status === 'rejected')).toEqual(
        [],
      );
    }
    expect(calls.map((call) => [call.path, call.body.stream ?? false])).toEqual(
      [
        ['/v1/chat/completions', false],
        ['/v1/embeddings', false],
        ['/v1/chat/completions', true],
      ],
    );
    expect(calls[1].body).toMatchObject({
      model: 'text-embedding-3-small',
      input: expect.any(String),
    });
    expect(await db.getRepository(ContentMetadata).count()).toBe(1);
  });

  it('실제 연결 취소는 진행 중 SDK signal을 중단하고 추가 요청을 만들지 않아야 한다', async () => {
    await seedRecommendation();
    let source: ReadableStreamDefaultController<Uint8Array> | undefined;
    let signalAborted!: () => void;
    const aborted = new Promise<void>((resolve) => {
      signalAborted = resolve;
    });
    const pendingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
        controller.enqueue(
          new TextEncoder().encode(
            streamFrame(recommendationJson('고정 추천 이유')),
          ),
        );
      },
    });
    respond = (call) => {
      if (!call.body.stream) return knowledgeResponse(call);
      const abort = () => {
        signalAborted();
        try {
          source?.error(new DOMException('fixture aborted', 'AbortError'));
        } catch {
          /* 이미 종료됨 */
        }
      };
      if (call.signal?.aborted) abort();
      else call.signal?.addEventListener('abort', abort, { once: true });
      return new Response(pendingStream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };
    const observer = jest.spyOn(
      harness.app.get<ChatService>(ChatService),
      'sendMessageStream',
    );
    let client: http.ClientRequest | undefined;
    try {
      await harness.app.listen(0, '127.0.0.1');
      const url = new URL('/api/chat/messages', await harness.app.getUrl());
      const body = JSON.stringify({ content: '드라마 영화 추천해줘' });
      await deadline(
        new Promise<void>((resolve, reject) => {
          client = http.request(
            url,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              },
            },
            (response) => {
              let received = '';
              response.on('data', (chunk: Buffer) => {
                received += chunk.toString();
                if (received.includes('event: text')) {
                  client?.destroy();
                  resolve();
                }
              });
              response.on('error', () => undefined);
            },
          );
          client.on('error', (error) => {
            if (!client?.destroyed) reject(error);
          });
          client.end(body);
        }),
      );
      await deadline(aborted);
      expect(calls).toHaveLength(3);
    } finally {
      client?.destroy();
      try {
        source?.close();
      } catch {
        /* abort가 이미 종료한 fixture */
      }
      await Promise.allSettled(
        observer.mock.results
          .filter((result) => result.type === 'return')
          .map((result) => result.value),
      );
      observer.mockRestore();
    }
    expect(calls).toHaveLength(3);
  });

  it.each([false, true])(
    '응답 종료 뒤 metadata background의 완료·실패를 독립적으로 보존해야 한다 (실패=%s)',
    async (failMetadata) => {
      const excluded = await fixtures.content({
        tmdbId: 999,
        adult: true,
        posterUrl: '/excluded.jpg',
      });
      await fixtures.contentMetadata({ contentId: excluded.id });
      const candidate = await fixtures.content({
        tmdbId: 101,
        title: '계약 드라마',
        posterUrl: '/poster.jpg',
      });
      let release!: (response: Response) => void;
      const descriptionResponse = new Promise<Response>((resolve) => {
        release = resolve;
      });
      let started!: () => void;
      const descriptionStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      respond = (call) => {
        if (call.body.stream)
          return streamResponse(recommendationJson('고정 추천 이유'));
        if (call.body.max_completion_tokens === 2048) {
          started();
          return descriptionResponse;
        }
        return knowledgeResponse(call);
      };
      const batch = jest.spyOn(
        harness.app.get<EmbeddingService>(EmbeddingService),
        'batchCacheByContentIds',
      );
      let results: PromiseSettledResult<unknown>[] = [];
      try {
        const response = await request(harness.app.getHttpServer())
          .post('/api/chat/messages')
          .send({ content: '드라마 영화 추천해줘' })
          .timeout({ deadline: 2000 })
          .expect(201);
        expect(events(response.text).at(-1)).toEqual({
          event: 'done',
          data: {},
        });
        await deadline(descriptionStarted);
        expect(
          await db
            .getRepository(ContentMetadata)
            .findOneBy({ contentId: candidate.id }),
        ).toBeNull();
        const descriptionCall = calls.find(
          (call) => call.body.max_completion_tokens === 2048,
        );
        expect(descriptionCall?.signal?.aborted).toBe(false);
        expect(descriptionCall?.body).toMatchObject({
          model: 'gpt-5.4-nano',
          reasoning_effort: 'low',
          max_completion_tokens: 2048,
        });
        expect(batch).toHaveBeenCalledWith([candidate.id]);
      } finally {
        release(
          failMetadata
            ? Response.json(
                {
                  error: {
                    message: '고정 metadata 실패',
                    type: 'invalid_request_error',
                  },
                },
                { status: 400 },
              )
            : completionResponse('고정 메타데이터 설명'),
        );
        results = await Promise.allSettled(
          batch.mock.results
            .filter((result) => result.type === 'return')
            .map((result) => result.value),
        );
        batch.mockRestore();
      }
      expect(results).toEqual([
        {
          status: 'fulfilled',
          value: {
            cached: failMetadata ? 0 : 1,
            skipped: 0,
            failed: failMetadata ? 1 : 0,
          },
        },
      ]);
      const saved = await db
        .getRepository(ContentMetadata)
        .findOneBy({ contentId: candidate.id });
      if (failMetadata) expect(saved).toBeNull();
      else
        expect(saved).toMatchObject({
          contentId: candidate.id,
          description: '고정 메타데이터 설명',
        });
      expect(calls).toHaveLength(failMetadata ? 4 : 5);
    },
  );
});
