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

    const emitFormattedVisibleText = (text: string, flush = false): void => {
      visibleLineBuffer += text;
      const lines = visibleLineBuffer.split('\n');
      visibleLineBuffer = flush ? '' : (lines.pop() ?? '');
      const completedLines = flush ? lines : lines;

      for (let i = 0; i < completedLines.length; i += 1) {
        const isLastFlushedLine = flush && i === completedLines.length - 1;
        const line = completedLines[i];
        if (isLastFlushedLine && line === '') continue;

        const formatted = formatRecommendationVisibleLine(line);
        if (formatted === null) continue;
        if (!hasEmittedText && formatted.trim().length === 0) continue;

        const output = `${formatted}${isLastFlushedLine ? '' : '\n'}`;
        visibleTextBuffer += output;
        this.emitTextIfNotEmpty(output, emit);
        hasEmittedText = hasEmittedText || formatted.length > 0;
      }
    };

    for await (const chunk of stream) {
      if (signal?.aborted) {
        return { visibleText: visibleTextBuffer, trailerText };
      }

      const content = chunk.choices[0]?.delta?.content;
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

    if (!isCollectingTrailer) {
      emitFormattedVisibleText(pendingText, true);
    } else {
      const closeIndex = trailerText.indexOf(RECOMMENDATIONS_TRAILER_CLOSE);
      if (closeIndex >= 0) {
        trailerText = trailerText.slice(
          0,
          closeIndex + RECOMMENDATIONS_TRAILER_CLOSE.length,
        );
      }
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
