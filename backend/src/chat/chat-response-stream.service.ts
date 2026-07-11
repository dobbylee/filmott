import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type OpenAI from 'openai';

const INCOMPLETE_RESPONSE_MESSAGE =
  'AI 응답이 완성되기 전에 종료되었습니다. 다시 시도해주세요.';

@Injectable()
export class ChatResponseStreamService {
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
