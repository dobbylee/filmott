import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ChatService, SessionListItem } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async createSession(@CurrentUser() user: JwtPayload) {
    return this.chatService.createSession(user.id);
  }

  @Get('sessions')
  async getSessions(@CurrentUser() user: JwtPayload): Promise<SessionListItem[]> {
    return this.chatService.getSessions(user.id);
  }

  @Get('sessions/:id/messages')
  async getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) sessionId: number,
  ) {
    return this.chatService.getMessages(user.id, sessionId);
  }

  @Post('sessions/:id/messages')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await this.chatService.sendMessageStream(
        user.id,
        sessionId,
        dto.content,
        (event: string, data: unknown) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '추천 중 오류가 발생했습니다.';
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Delete('sessions/:id')
  async deleteSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) sessionId: number,
  ) {
    await this.chatService.deleteSession(user.id, sessionId);
    return { message: '세션이 삭제되었습니다.' };
  }
}
