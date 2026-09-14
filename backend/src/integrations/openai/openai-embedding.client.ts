import { Injectable } from '@nestjs/common';
import type OpenAI from 'openai';
import { OpenAISdkProvider } from './openai-sdk.provider';

@Injectable()
export class OpenAIEmbeddingClient {
  constructor(private readonly sdk: OpenAISdkProvider) {}

  isAvailable(): boolean {
    return this.sdk.isAvailable();
  }

  createEmbedding(
    body: OpenAI.EmbeddingCreateParams,
    options?: OpenAI.RequestOptions,
  ) {
    return this.sdk.getClient().embeddings.create(body, options);
  }
}
