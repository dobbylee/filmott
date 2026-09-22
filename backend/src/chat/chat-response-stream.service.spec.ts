import type OpenAI from 'openai';
import type { OpenAIChatClient } from '../integrations/openai/openai-chat.client';
import { CHAT_RESPONSE_FORMAT } from './structured-chat-response';
import type { ChatHistoryMessageDto } from './dto/send-message.dto';
import { OpenAIError } from 'openai';
import { LengthFinishReasonError } from 'openai/error';
import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { ChatResponseStreamService } from './chat-response-stream.service';
import type { SimilarContent } from '../recommendation/recommendation.types';
import type { StructuredChatResponse } from './structured-chat-response';
import { StructuredChatStreamAccumulator } from './structured-chat-stream';

function createStream(
  chunks: string[],
  finishReason: 'stop' | 'length' | null = 'stop',
): AsyncIterable<OpenAI.Chat.ChatCompletionChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const content of chunks) {
        yield {
          choices: [{ delta: { content }, finish_reason: null, index: 0 }],
        } as OpenAI.Chat.ChatCompletionChunk;
      }
      if (finishReason) {
        yield {
          choices: [{ delta: {}, finish_reason: finishReason, index: 0 }],
        } as OpenAI.Chat.ChatCompletionChunk;
      }
    },
  };
}

function createFailingStructuredStream(
  error: Error,
): ChatCompletionStream<StructuredChatResponse> {
  return {
    on: jest.fn(),
    off: jest.fn(),
    abort: jest.fn(),
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(error),
      };
    },
  } as unknown as ChatCompletionStream<StructuredChatResponse>;
}

function createLunaOrderedStructuredStream(): ChatCompletionStream<StructuredChatResponse> {
  type ContentDeltaListener = (event: {
    delta: string;
    parsed: unknown;
  }) => void;
  const listeners = new Set<ContentDeltaListener>();
  const events = [
    {
      delta:
        '{"followUpQuestion":"다른 분위기도 원하세요?","message":"","recommendations":[',
      parsed: {
        followUpQuestion: '다른 분위기도 원하세요?',
        message: '',
        recommendations: [],
      },
    },
    {
      delta: '{"contentType":"movie","reason":"강렬해요.","tmdbId":496243}',
      parsed: {
        followUpQuestion: '다른 분위기도 원하세요?',
        message: '',
        recommendations: [
          {
            contentType: 'movie',
            reason: '강렬해요.',
            tmdbId: 496243,
          },
        ],
      },
    },
    {
      delta: ']}',
      parsed: {
        followUpQuestion: '다른 분위기도 원하세요?',
        message: '',
        recommendations: [
          {
            contentType: 'movie',
            reason: '강렬해요.',
            tmdbId: 496243,
          },
        ],
      },
    },
  ];

  return {
    on: jest.fn((event: string, listener: ContentDeltaListener) => {
      if (event === 'content.delta') listeners.add(listener);
      return undefined;
    }),
    off: jest.fn((event: string, listener: ContentDeltaListener) => {
      if (event === 'content.delta') listeners.delete(listener);
      return undefined;
    }),
    abort: jest.fn(),
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        for (const listener of listeners) listener(event);
        yield {
          choices: [
            { delta: { content: event.delta }, finish_reason: null, index: 0 },
          ],
        } as OpenAI.Chat.ChatCompletionChunk;
      }
      yield {
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      } as OpenAI.Chat.ChatCompletionChunk;
    },
  } as unknown as ChatCompletionStream<StructuredChatResponse>;
}

const candidates: SimilarContent[] = [
  {
    contentId: 1,
    tmdbId: 496243,
    contentType: 'movie',
    title: '기생충',
    posterUrl: '/parasite.jpg',
    genres: [],
    voteAverage: 8.5,
    description: '',
    similarity: 0.9,
    director: null,
    originCountry: 'KR',
    overview: null,
  },
];

describe('ChatResponseStreamService', () => {
  const client = { stream: jest.fn(), isAvailable: jest.fn() };
  const service = new ChatResponseStreamService(
    client as unknown as OpenAIChatClient,
  );

  beforeEach(() => jest.clearAllMocks());

  it.each([true, false])(
    '공용 client의 사용 가능 상태 %s를 그대로 반환해야 한다',
    (available) => {
      client.isAvailable.mockReturnValue(available);
      expect(service.isAvailable()).toBe(available);
      expect(client.stream).not.toHaveBeenCalled();
    },
  );

  it('이력의 역할과 본문만 순서대로 넣고 기존 설정과 signal로 stream을 한 번 생성해야 한다', () => {
    const signal = new AbortController().signal;
    const history: ChatHistoryMessageDto[] = [
      { role: 'user', content: '이전 질문' },
      {
        role: 'assistant',
        content: '이전 답변',
        recommendations: [
          { tmdbId: 496243, contentType: 'movie', title: '기생충' },
        ],
      },
    ];
    const stream = createLunaOrderedStructuredStream();
    client.stream.mockReturnValue(stream);
    expect(
      service.startResponseStream('시스템', history, '현재 질문', signal),
    ).toBe(stream);
    expect(client.stream).toHaveBeenCalledTimes(1);
    expect(client.stream).toHaveBeenCalledWith(
      {
        model: 'gpt-6-luna',
        reasoning_effort: 'medium',
        max_completion_tokens: 4096,
        response_format: CHAT_RESPONSE_FORMAT,
        messages: [
          { role: 'system', content: '시스템' },
          { role: 'user', content: '이전 질문' },
          { role: 'assistant', content: '이전 답변' },
          { role: 'user', content: '현재 질문' },
        ],
      },
      { timeout: 30_000, signal },
    );
    expect(history[1].recommendations).toHaveLength(1);
  });

  it('구조화 JSON chunk를 client에 노출하지 않고 하나로 수집해야 한다', async () => {
    await expect(
      service.collectStructuredResponse(
        createStream([
          '{"message":"안녕",',
          '"recommendations":[],',
          '"followUpQuestion":""}',
        ]),
      ),
    ).resolves.toBe(
      '{"message":"안녕","recommendations":[],"followUpQuestion":""}',
    );
  });

  it('recommendations가 마지막인 Luna snapshot도 배열이 닫힐 때 검증해야 한다', async () => {
    const emitText = jest.fn();

    await expect(
      service.collectAndEmitStructuredResponse(
        createLunaOrderedStructuredStream(),
        new StructuredChatStreamAccumulator(),
        candidates,
        emitText,
      ),
    ).resolves.toBe(
      '{"followUpQuestion":"다른 분위기도 원하세요?","message":"","recommendations":[{"contentType":"movie","reason":"강렬해요.","tmdbId":496243}]}',
    );
    expect(emitText.mock.calls.map(([text]) => text)).toEqual([
      '**기생충** - 강렬해요.',
      '\n\n다른 분위기도 원하세요?',
    ]);
  });

  it('finish_reason이 stop이 아니면 불완전 응답으로 거부해야 한다', async () => {
    await expect(
      service.collectStructuredResponse(createStream(['{}'], 'length')),
    ).rejects.toThrow('AI 응답이 완성되기 전에 종료되었습니다');
  });

  it('본문이 비어 있으면 응답 생성 실패로 거부해야 한다', async () => {
    await expect(
      service.collectStructuredResponse(createStream(['   '])),
    ).rejects.toThrow('AI 응답을 생성하지 못했습니다');
  });

  it('모델이 안전상 거절하면 본문을 노출하지 않고 거절 응답으로 처리해야 한다', async () => {
    const refusalStream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk> = {
      async *[Symbol.asyncIterator]() {
        yield {
          choices: [
            {
              delta: { refusal: '처리할 수 없는 요청입니다.' },
              finish_reason: null,
              index: 0,
            },
          ],
        } as OpenAI.Chat.ChatCompletionChunk;
        yield {
          choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        } as OpenAI.Chat.ChatCompletionChunk;
      },
    };

    await expect(
      service.collectStructuredResponse(refusalStream),
    ).rejects.toThrow(
      '요청하신 내용에는 답변을 제공할 수 없습니다. 다른 조건으로 질문해주세요.',
    );
  });

  it('SDK의 길이 종료 오류는 기존 재생성 가능한 불완전 응답 오류로 변환해야 한다', async () => {
    await expect(
      service.collectAndEmitStructuredResponse(
        createFailingStructuredStream(new LengthFinishReasonError()),
        new StructuredChatStreamAccumulator(),
        [],
        jest.fn(),
      ),
    ).rejects.toThrow('AI 응답이 완성되기 전에 종료되었습니다');
  });

  it('SDK가 감싼 최종 JSON 파싱 오류는 기존 재생성 가능한 형식 오류로 변환해야 한다', async () => {
    const sdkError = new OpenAIError('structured parse failed');
    sdkError.cause = new SyntaxError('invalid JSON');

    await expect(
      service.collectAndEmitStructuredResponse(
        createFailingStructuredStream(sdkError),
        new StructuredChatStreamAccumulator(),
        [],
        jest.fn(),
      ),
    ).rejects.toThrow('AI 응답 형식이 올바르지 않습니다');
  });
});
