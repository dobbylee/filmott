import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAISdkProvider } from './openai-sdk.provider';
import { OpenAIChatClient } from './openai-chat.client';

@Module({
  imports: [ConfigModule],
  providers: [OpenAISdkProvider, OpenAIChatClient],
  exports: [OpenAIChatClient],
})
export class OpenAIModule {}
