import type OpenAI from 'openai';
import { OpenAIError } from 'openai';
import { LengthFinishReasonError } from 'openai/error';
import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { ChatResponseStreamService } from './chat-response-stream.service';
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

describe('ChatResponseStreamService', () => {
  const service = new ChatResponseStreamService();

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
