import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAISdkProvider {
  private readonly client: OpenAI | null;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('OPENAI_API_KEY', '');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  getClient(): OpenAI {
    if (!this.client) {
      throw new Error('OpenAI API key가 설정되지 않았습니다.');
    }
    return this.client;
  }
}
