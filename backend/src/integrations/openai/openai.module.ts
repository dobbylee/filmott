import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAISdkProvider } from './openai-sdk.provider';
import { OpenAIChatClient } from './openai-chat.client';
import { OpenAIEmbeddingClient } from './openai-embedding.client';

@Module({
  imports: [ConfigModule],
  providers: [OpenAISdkProvider, OpenAIChatClient, OpenAIEmbeddingClient],
  exports: [OpenAIChatClient, OpenAIEmbeddingClient],
})
export class OpenAIModule {}
