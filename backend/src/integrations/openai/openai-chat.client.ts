import { Injectable } from '@nestjs/common';
import type OpenAI from 'openai';
import type { ChatCompletionStreamParams } from 'openai/lib/ChatCompletionStream';
import { OpenAISdkProvider } from './openai-sdk.provider';

@Injectable()
export class OpenAIChatClient {
  constructor(private readonly sdk: OpenAISdkProvider) {}

  isAvailable(): boolean {
    return this.sdk.isAvailable();
  }

  createCompletion(
    body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    options?: OpenAI.RequestOptions,
  ) {
    return this.sdk.getClient().chat.completions.create(body, options);
  }

  stream<Params extends ChatCompletionStreamParams>(
    body: Params,
    options?: OpenAI.RequestOptions,
  ) {
    return this.sdk.getClient().chat.completions.stream(body, options);
  }
}
