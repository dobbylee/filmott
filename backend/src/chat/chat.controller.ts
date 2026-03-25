import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async sendMessage(
    @CurrentUser() user: JwtPayload | null,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // SSE 연결 끊김 시 OpenAI 스트림 중단용
    const abortController = new AbortController();
    res.on('close', () => {
      abortController.abort();
    });

    try {
      await this.chatService.sendMessageStream(
        user?.id ?? null,
        dto.content,
        dto.history ?? [],
        (event: string, data: unknown) => {
          if (!abortController.signal.aborted) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          }
        },
        abortController.signal,
      );
    } catch (error) {
      if (!abortController.signal.aborted) {
        const message =
          error instanceof Error
            ? error.message
            : '추천 중 오류가 발생했습니다.';
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      }
    } finally {
      if (!abortController.signal.aborted) {
        res.end();
      }
    }
  }
}
