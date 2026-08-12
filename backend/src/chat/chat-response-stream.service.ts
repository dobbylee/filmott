import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type OpenAI from 'openai';
import {
  ContentFilterFinishReasonError,
  LengthFinishReasonError,
} from 'openai/error';
import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { ZodError } from 'zod';
import type { SimilarContent } from '../embedding/embedding.service';
import type { StructuredChatResponse } from './structured-chat-response';
import { StructuredChatStreamAccumulator } from './structured-chat-stream';

const INCOMPLETE_RESPONSE_MESSAGE =
  'AI 응답이 완성되기 전에 종료되었습니다. 다시 시도해주세요.';

function hasCompletedRecommendationsArray(json: string): boolean {
  let objectDepth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaping = false;
  let stringStart = -1;
  let recommendationsArrayStart = -1;

  for (let index = 0; index < json.length; index += 1) {
    const character = json[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (character === '\\') {
        escaping = true;
        continue;
      }
      if (character !== '"') continue;

      inString = false;
      if (objectDepth !== 1 || arrayDepth !== 0) continue;
      if (json.slice(stringStart, index) !== 'recommendations') continue;

      let cursor = index + 1;
      while (/\s/.test(json[cursor] ?? '')) cursor += 1;
      if (json[cursor] !== ':') continue;
      cursor += 1;
      while (/\s/.test(json[cursor] ?? '')) cursor += 1;
      if (json[cursor] === '[') {
        recommendationsArrayStart = cursor;
        break;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      stringStart = index + 1;
    } else if (character === '{') {
      objectDepth += 1;
    } else if (character === '}') {
      objectDepth -= 1;
    } else if (character === '[') {
      arrayDepth += 1;
    } else if (character === ']') {
      arrayDepth -= 1;
    }
  }

  if (recommendationsArrayStart < 0) return false;

  let depth = 0;
  inString = false;
  escaping = false;
  for (let index = recommendationsArrayStart; index < json.length; index += 1) {
    const character = json[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (character === '\\') {
        escaping = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth -= 1;
      if (depth === 0) return true;
    }
  }

  return false;
}

@Injectable()
export class ChatResponseStreamService {
  async collectAndEmitStructuredResponse(
    stream: ChatCompletionStream<StructuredChatResponse>,
    accumulator: StructuredChatStreamAccumulator,
    candidates: SimilarContent[],
    emitText: (content: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    let accumulatorErrorMessage: string | null = null;
    let partialResponseText = '';
    const handleContentDelta = ({
      delta,
      parsed,
    }: {
      delta: string;
      parsed: unknown;
    }) => {
      if (accumulatorErrorMessage || signal?.aborted) return;
      partialResponseText += delta;

      try {
        for (const content of accumulator.consume(
          parsed,
          candidates,
          hasCompletedRecommendationsArray(partialResponseText),
        )) {
          emitText(content);
        }
      } catch (error) {
        accumulatorErrorMessage =
          error instanceof Error ? error.message : String(error);
        stream.abort();
      }
    };

    // OpenAI SDK의 Structured Outputs stream helper에서만 부분 parsed snapshot을 제공한다.
    // 테스트용 최소 AsyncIterable은 on/off가 없으므로 최종 검증 경로만 수행한다.
    const eventStream =
      stream as ChatCompletionStream<StructuredChatResponse> & {
        on?: (
          event: 'content.delta',
          listener: typeof handleContentDelta,
        ) => unknown;
        off?: (
          event: 'content.delta',
          listener: typeof handleContentDelta,
        ) => unknown;
      };
    eventStream.on?.('content.delta', handleContentDelta);

    try {
      const responseText = await this.collectStructuredResponse(stream, signal);
      if (accumulatorErrorMessage) {
        throw new BadRequestException(accumulatorErrorMessage);
      }
      return responseText;
    } catch (error) {
      if (accumulatorErrorMessage) {
        throw new BadRequestException(accumulatorErrorMessage);
      }
      if (
        error instanceof LengthFinishReasonError ||
        error instanceof ContentFilterFinishReasonError
      ) {
        throw new BadRequestException(INCOMPLETE_RESPONSE_MESSAGE);
      }
      if (
        error instanceof Error &&
        (error.cause instanceof SyntaxError || error.cause instanceof ZodError)
      ) {
        throw new BadRequestException(
          'AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.',
        );
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      eventStream.off?.('content.delta', handleContentDelta);
    }
  }

  async collectStructuredResponse(
    stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    signal?: AbortSignal,
  ): Promise<string> {
    let responseText = '';
    let refusalText = '';
    let finishReason: OpenAI.Chat.ChatCompletionChunk.Choice['finish_reason'] =
      null;

    for await (const chunk of stream) {
      if (signal?.aborted) return '';

      const choice = chunk.choices[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (choice?.delta?.content) responseText += choice.delta.content;
      if (choice?.delta?.refusal) refusalText += choice.delta.refusal;
    }

    if (signal?.aborted) return '';
    if (refusalText.trim()) {
      throw new ForbiddenException(
        '요청하신 내용에는 답변을 제공할 수 없습니다. 다른 조건으로 질문해주세요.',
      );
    }
    if (finishReason !== 'stop') {
      throw new BadRequestException(INCOMPLETE_RESPONSE_MESSAGE);
    }
    if (!responseText.trim()) {
      throw new BadRequestException('AI 응답을 생성하지 못했습니다.');
    }

    return responseText;
  }
}
