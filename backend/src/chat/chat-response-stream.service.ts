import { BadRequestException, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import {
  RECOMMENDATIONS_TRAILER_CLOSE,
  RECOMMENDATIONS_TRAILER_OPEN,
  formatRecommendationVisibleLine,
} from './structured-chat-response';

const TRAILER_DETECTION_TAIL_LENGTH = RECOMMENDATIONS_TRAILER_OPEN.length - 1;

type SseEmitter = (event: string, data: unknown) => void;

interface StreamedChatResponse {
  visibleText: string;
  trailerText: string;
}

const INCOMPLETE_RESPONSE_MESSAGE =
  'AI 응답이 완성되기 전에 종료되었습니다. 다시 시도해주세요.';

function getTrailingTrailerPrefixLength(text: string): number {
  const maxLength = Math.min(
    text.length,
    RECOMMENDATIONS_TRAILER_OPEN.length - 1,
  );

  for (let length = maxLength; length > 0; length -= 1) {
    if (text.endsWith(RECOMMENDATIONS_TRAILER_OPEN.slice(0, length))) {
      return length;
    }
  }

  return 0;
}

@Injectable()
export class ChatResponseStreamService {
  async emitStreamingText(
    stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    emit: SseEmitter,
    signal?: AbortSignal,
  ): Promise<StreamedChatResponse> {
    let pendingText = '';
    let trailerText = '';
    let visibleTextBuffer = '';
    let visibleLineBuffer = '';
    let isCollectingTrailer = false;
    let hasEmittedText = false;
    let hasEmittedRecommendation = false;
    let finishReason: OpenAI.Chat.ChatCompletionChunk.Choice['finish_reason'] =
      null;

    const emitFormattedVisibleText = (text: string, flush = false): void => {
      visibleLineBuffer += text;
      const lines = visibleLineBuffer.split('\n');
      visibleLineBuffer = flush ? '' : (lines.pop() ?? '');

      for (let i = 0; i < lines.length; i += 1) {
        const isLastFlushedLine = flush && i === lines.length - 1;
        const line = lines[i];
        if (isLastFlushedLine && line === '') continue;

        const formatted = formatRecommendationVisibleLine(line);
        if (formatted === null) continue;
        if (!hasEmittedText && formatted.trim().length === 0) continue;

        const isRecommendation = /^\*\*.+\*\*\s[—-]\s.+$/.test(formatted);
        if (
          isRecommendation &&
          hasEmittedRecommendation &&
          !visibleTextBuffer.endsWith('\n\n')
        ) {
          const separator = visibleTextBuffer.endsWith('\n') ? '\n' : '\n\n';
          visibleTextBuffer += separator;
          this.emitTextIfNotEmpty(separator, emit);
        }

        const output = `${formatted}${isLastFlushedLine ? '' : '\n'}`;
        visibleTextBuffer += output;
        this.emitTextIfNotEmpty(output, emit);
        hasEmittedText = hasEmittedText || formatted.length > 0;
        hasEmittedRecommendation = hasEmittedRecommendation || isRecommendation;
      }
    };

    for await (const chunk of stream) {
      if (signal?.aborted) {
        return { visibleText: visibleTextBuffer, trailerText };
      }

      const choice = chunk.choices[0];
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const content = choice?.delta?.content;
      if (!content) continue;

      if (isCollectingTrailer) {
        trailerText += content;
        continue;
      }

      const combined = pendingText + content;
      const trailerStartIndex = combined.indexOf(RECOMMENDATIONS_TRAILER_OPEN);
      if (trailerStartIndex >= 0) {
        const visibleText = combined.slice(0, trailerStartIndex);
        emitFormattedVisibleText(visibleText, true);
        trailerText =
          RECOMMENDATIONS_TRAILER_OPEN +
          combined.slice(
            trailerStartIndex + RECOMMENDATIONS_TRAILER_OPEN.length,
          );
        pendingText = '';
        isCollectingTrailer = true;
        continue;
      }

      if (combined.length <= TRAILER_DETECTION_TAIL_LENGTH) {
        pendingText = combined;
        continue;
      }

      const emitLength = combined.length - TRAILER_DETECTION_TAIL_LENGTH;
      const visibleText = combined.slice(0, emitLength);
      pendingText = combined.slice(emitLength);
      emitFormattedVisibleText(visibleText);
    }

    if (signal?.aborted) {
      return { visibleText: visibleTextBuffer, trailerText };
    }

    if (!isCollectingTrailer) {
      const partialTrailerLength = getTrailingTrailerPrefixLength(pendingText);
      emitFormattedVisibleText(
        partialTrailerLength > 0
          ? pendingText.slice(0, -partialTrailerLength)
          : pendingText,
        true,
      );
      if (partialTrailerLength > 0) {
        throw new BadRequestException(INCOMPLETE_RESPONSE_MESSAGE);
      }
    } else {
      const closeIndex = trailerText.indexOf(RECOMMENDATIONS_TRAILER_CLOSE);
      if (closeIndex < 0) {
        throw new BadRequestException(INCOMPLETE_RESPONSE_MESSAGE);
      }
      trailerText = trailerText.slice(
        0,
        closeIndex + RECOMMENDATIONS_TRAILER_CLOSE.length,
      );
    }

    if (finishReason !== 'stop') {
      throw new BadRequestException(INCOMPLETE_RESPONSE_MESSAGE);
    }

    if (!hasEmittedText && !signal?.aborted) {
      throw new BadRequestException('AI 응답을 생성하지 못했습니다.');
    }

    return { visibleText: visibleTextBuffer, trailerText };
  }

  private emitTextIfNotEmpty(text: string, emit: SseEmitter): void {
    if (text.length > 0) {
      emit('text', { content: text });
    }
  }
}
