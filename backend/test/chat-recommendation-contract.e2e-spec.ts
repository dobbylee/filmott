import request from 'supertest';
import { DataSource } from 'typeorm';
import type { InternalAxiosRequestConfig } from 'axios';
import { ChatService } from '../src/chat/chat.service';
import { Content } from '../src/contents/content.entity';
import { ContentMetadata } from '../src/recommendation/content-metadata.entity';
import { ContentMetadataService } from '../src/recommendation/content-metadata.service';
import { RecommendationSearchService } from '../src/recommendation/recommendation-search.service';
import { createContractApp } from './contracts/contract-app';
import {
  completionResponse,
  embeddingResponse,
  streamResponse,
} from './contracts/openai-fixtures';
import {
  createDirectionalEmbedding,
  createIntegrationFixtures,
} from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

interface Call {
  path: string;
  body: Record<string, unknown>;
  signal?: AbortSignal | null;
}
function events(text: string): { event: string; data: unknown }[] {
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      const [event, data] = frame.split('\n');
      return {
        event: event.slice(7),
        data: JSON.parse(data.slice(6)) as unknown,
      };
    });
}

const queryVector = createDirectionalEmbedding(1);
const description = '새 기준 작품의 고정 설명';
function detail(type: 'movie' | 'tv') {
  return {
    id: 301,
    title: '새 기준',
    name: '새 기준',
    original_title: 'Reference',
    original_name: 'Reference',
    overview: '참조 작품 줄거리',
    release_date: '2026-01-01',
    first_air_date: '2026-01-01',
    poster_path: '/reference.jpg',
    vote_average: 8,
    vote_count: 100,
    adult: false,
    genres: [{ id: 18, name: 'Drama' }],
    runtime: 120,
    production_countries: [{ iso_3166_1: 'KR' }],
    origin_country: ['KR'],
    credits: { cast: [], crew: [] },
    media_type: type,
  };
}

describe('추천 검색·참조 작품 실제 HTTP·DB 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let calls: Call[];
  let intent: {
    confidence: 'low' | 'high';
    contentType: 'movie' | 'tv' | null;
    referenceTitles: string[];
  };
  let selectedType: 'movie' | 'tv';
  let httpFixture: (config: InternalAxiosRequestConfig) => unknown;
  let onDescription: ((call: Call) => void) | undefined;
  let batch: jest.SpyInstance;

  beforeEach(async () => {
    calls = [];
    selectedType = 'movie';
    intent = { confidence: 'low', contentType: null, referenceTitles: [] };
    onDescription = undefined;
    httpFixture = (config) => {
      throw new Error(`미등록 fixture: ${config.url}`);
    };
    harness = await createContractApp({
      openaiKey: 'contract-key',
      http: (config) => httpFixture(config),
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.startsWith('https://api.openai.com/v1/'))
          throw new Error(`미등록 fixture: ${url}`);
        if (typeof init?.body !== 'string')
          throw new Error('SDK JSON body가 없습니다.');
        const body: unknown = JSON.parse(init.body);
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new Error('잘못된 SDK body');
        const call: Call = {
          path: new URL(url).pathname,
          body: body as Record<string, unknown>,
          signal: init?.signal,
        };
        calls.push(call);
        if (call.path === '/v1/embeddings')
          return embeddingResponse(call.body.encoding_format, queryVector);
        if (call.path !== '/v1/chat/completions')
          throw new Error(`미등록 fixture: ${call.path}`);
        if (call.body.stream)
          return streamResponse(
            JSON.stringify({
              recommendations: [
                {
                  tmdbId: 201,
                  contentType: selectedType,
                  reason: '고정 추천 이유',
                },
              ],
              message: '',
              followUpQuestion: '',
            }),
          );
        if (call.body.max_completion_tokens === 2048) {
          onDescription?.(call);
          return completionResponse(description);
        }
        if (call.body.max_completion_tokens !== 1024)
          throw new Error('미등록 intent 요청');
        return completionResponse(
          JSON.stringify({
            ottProviderNames: [],
            countries: [],
            excludeCountries: [],
            personNames: [],
            genres: [],
            dateRange: null,
            ...intent,
          }),
        );
      },
    });
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
    batch = jest.spyOn(
      harness.app.get(ContentMetadataService),
      'batchCacheByContentIds',
    );
  });

  afterEach(async () => {
    if (!harness) return;
    try {
      const settled = await Promise.allSettled(
        batch.mock.results
          .filter((result) => result.type === 'return')
          .map((result) => result.value),
      );
      expect(settled.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      expect(harness.unexpected).toEqual([]);
    } finally {
      batch.mockRestore();
      await harness.close();
    }
  });

  async function candidate() {
    const content = await fixtures.content({
      tmdbId: 201,
      title: '추천 후보',
      contentType: selectedType,
      posterUrl: '/candidate.jpg',
    });
    await fixtures.contentMetadata({
      contentId: content.id,
      embedding: JSON.stringify(createDirectionalEmbedding(0.95)),
    });
    return content;
  }

  async function send(content: string) {
    const response = await request(harness.app.getHttpServer())
      .post('/api/chat/messages')
      .send({ content })
      .expect(201);
    const frames = events(response.text);
    expect(frames).toEqual([
      { event: 'text', data: { content: '**추천 후보** - 고정 추천 이유' } },
      {
        event: 'recommendations',
        data: {
          recommendations: [
            {
              tmdbId: 201,
              contentType: selectedType,
              title: '추천 후보',
              posterUrl: '/candidate.jpg',
            },
          ],
        },
      },
      { event: 'done', data: {} },
    ]);
    return response;
  }

  function allowReferenceLookup(movieFound: boolean) {
    httpFixture = (config) => {
      if (config.url === '/search/movie' || config.url === '/search/tv') {
        const id =
          config.url === '/search/movie'
            ? movieFound
              ? 301
              : null
            : movieFound
              ? 302
              : 301;
        return {
          page: 1,
          total_pages: 1,
          total_results: id ? 1 : 0,
          results: id ? [{ id, title: '새 기준', name: '새 기준' }] : [],
        };
      }
      if (config.url === `/${selectedType}/301`) {
        return detail(selectedType);
      }
      throw new Error(`미등록 fixture: ${config.url}`);
    };
  }

  it('metadata가 있는 익명 저신뢰 요청은 실제 searchSimilar를 거쳐 후보와 SSE를 반환해야 한다', async () => {
    await candidate();
    const search = jest.spyOn(
      harness.app.get(RecommendationSearchService),
      'searchSimilar',
    );
    try {
      await send('볼거리 추천해줘');
      expect(search).toHaveBeenCalledTimes(1);
      expect(
        (await search.mock.results[0].value).map(
          (item: { tmdbId: number }) => item.tmdbId,
        ),
      ).toEqual([201]);
      expect(
        calls.map((call) => [call.path, call.body.stream ?? false]),
      ).toEqual([
        ['/v1/chat/completions', false],
        ['/v1/embeddings', false],
        ['/v1/chat/completions', true],
      ]);
      expect(harness.httpCalls).toEqual([]);
    } finally {
      search.mockRestore();
    }
  });

  it('참조 작품 DB hit는 저장 벡터를 재사용하고 원작 제외 후 새 외부 조회 없이 추천해야 한다', async () => {
    await candidate();
    const source = await fixtures.content({
      tmdbId: 301,
      title: '기준 작품',
      posterUrl: '/source.jpg',
    });
    await fixtures.contentMetadata({
      contentId: source.id,
      embedding: JSON.stringify(queryVector),
    });
    const metadata = await db
      .getRepository(ContentMetadata)
      .findOneByOrFail({ contentId: source.id });
    intent = {
      confidence: 'high',
      contentType: 'movie',
      referenceTitles: ['기준 작품'],
    };
    const search = jest.spyOn(
      harness.app.get(RecommendationSearchService),
      'searchWithFilters',
    );
    try {
      await send('기준 작품 같은 영화 추천해줘');
      expect(search).toHaveBeenCalledTimes(1);
      expect(search.mock.calls[0][2]).toEqual([301]);
      expect(search.mock.calls[0][4]).toEqual(queryVector);
      expect(
        (await search.mock.results[0].value).map(
          (item: { tmdbId: number }) => item.tmdbId,
        ),
      ).toEqual([201]);
      expect(
        calls.map((call) => [call.path, call.body.max_completion_tokens]),
      ).toEqual([
        ['/v1/chat/completions', 1024],
        ['/v1/chat/completions', 4096],
      ]);
      expect(harness.httpCalls).toEqual([]);
      expect(
        await db
          .getRepository(ContentMetadata)
          .findOneByOrFail({ contentId: source.id }),
      ).toEqual(metadata);
    } finally {
      search.mockRestore();
    }
  });

  it.each(['movie', 'tv'] as const)(
    '참조 DB miss는 %s 검색·실제 저장·metadata 생성 후 벡터를 재사용해야 한다',
    async (type) => {
      selectedType = type;
      await candidate();
      intent = {
        confidence: 'high',
        contentType: type,
        referenceTitles: ['새 기준'],
      };
      allowReferenceLookup(type === 'movie');
      const search = jest.spyOn(
        harness.app.get(RecommendationSearchService),
        'searchWithFilters',
      );
      try {
        await send(
          `새 기준 같은 ${type === 'movie' ? '영화' : '시리즈'} 추천해줘`,
        );
        expect(harness.httpCalls.map((call) => call.url)).toEqual([
          '/search/movie',
          '/search/tv',
          `/${type}/301`,
        ]);
        expect(
          harness.httpCalls.every((call) => call.signal !== undefined),
        ).toBe(true);
        for (const call of harness.httpCalls.slice(0, 2)) {
          expect(call.params).toMatchObject({
            query: '새 기준',
            page: 1,
            include_adult: false,
          });
        }
        expect(harness.httpCalls[2].params).toEqual({
          language: 'ko-KR',
          append_to_response: 'credits,watch/providers',
        });
        const source = await db
          .getRepository(Content)
          .findOneByOrFail({ tmdbId: 301, contentType: type });
        const saved = await db
          .getRepository(ContentMetadata)
          .findOneByOrFail({ contentId: source.id });
        expect(source).toMatchObject({
          title: '새 기준',
          posterUrl: 'https://image.tmdb.org/t/p/w500/reference.jpg',
        });
        expect(saved.description).toBe(description);
        expect(saved.embedding).toEqual(queryVector);
        expect(search.mock.calls[0][2]).toEqual([301]);
        expect(search.mock.calls[0][4]).toEqual(queryVector);
        expect(
          (await search.mock.results[0].value).map(
            (item: { tmdbId: number }) => item.tmdbId,
          ),
        ).toEqual([201]);
        expect(
          calls.map((call) => [
            call.path,
            call.body.max_completion_tokens ?? null,
          ]),
        ).toEqual([
          ['/v1/chat/completions', 1024],
          ['/v1/chat/completions', 2048],
          ['/v1/embeddings', null],
          ['/v1/chat/completions', 4096],
        ]);
        expect(calls[2].body.input).toBe(description);
        expect(calls.every((call) => call.signal !== undefined)).toBe(true);
        expect(await db.getRepository(ContentMetadata).count()).toBe(2);
      } finally {
        search.mockRestore();
      }
    },
  );

  it.each(['tmdb', 'description'] as const)(
    '참조 %s foreground 중 취소하면 후속 저장·embedding·SSE를 시작하지 않아야 한다',
    async (phase) => {
      await candidate();
      intent = {
        confidence: 'high',
        contentType: 'movie',
        referenceTitles: ['새 기준'],
      };
      const controller = new AbortController();
      let transportSignal: { aborted: boolean } | null | undefined;
      allowReferenceLookup(true);
      const originalHttp = httpFixture;
      httpFixture = (config) => {
        const value = originalHttp(config);
        if (phase === 'tmdb' && config.url === '/movie/301') {
          transportSignal = config.signal;
          controller.abort();
        }
        return value;
      };
      onDescription = (call) => {
        transportSignal = call.signal;
        controller.abort();
      };
      const emit = jest.fn();
      await harness.app
        .get(ChatService)
        .sendMessageStream(
          null,
          '새 기준 같은 영화 추천해줘',
          [],
          emit,
          controller.signal,
        );
      expect(controller.signal.aborted).toBe(true);
      // Fixture 안의 assertion은 취소 처리의 catch에서 삼켜질 수 있어 밖에서 검증한다.
      expect(transportSignal).toBeDefined();
      expect(transportSignal?.aborted).toBe(true);
      expect(emit).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
      expect(
        calls.some(
          (call) => call.path === '/v1/embeddings' || call.body.stream,
        ),
      ).toBe(false);
      expect(await db.getRepository(Content).countBy({ tmdbId: 301 })).toBe(
        phase === 'tmdb' ? 0 : 1,
      );
      expect(await db.getRepository(ContentMetadata).count()).toBe(1);
    },
  );
});
