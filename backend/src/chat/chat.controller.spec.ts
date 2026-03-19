import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('ChatController', () => {
  let controller: ChatController;

  const mockChatService = {
    createSession: jest.fn(),
    getSessions: jest.fn(),
    getMessages: jest.fn(),
    deleteSession: jest.fn(),
    sendMessageStream: jest.fn(),
  };

  const user = { id: 1, nickname: 'test', role: 'USER' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('정의되어 있어야 한다', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /chat/sessions', () => {
    it('새 세션을 생성해야 한다', async () => {
      const created = { id: 1, title: null, createdAt: new Date() };
      mockChatService.createSession.mockResolvedValue(created);

      const result = await controller.createSession(user);

      expect(result).toEqual(created);
      expect(mockChatService.createSession).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /chat/sessions', () => {
    it('세션 목록을 반환해야 한다', async () => {
      const sessions = [
        { id: 1, title: '테스트', updatedAt: new Date(), lastMessage: '안녕' },
      ];
      mockChatService.getSessions.mockResolvedValue(sessions);

      const result = await controller.getSessions(user);

      expect(result).toEqual(sessions);
      expect(mockChatService.getSessions).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /chat/sessions/:id/messages', () => {
    it('메시지 이력을 반환해야 한다', async () => {
      const messages = [
        { id: 1, role: 'user', content: '안녕', createdAt: new Date() },
      ];
      mockChatService.getMessages.mockResolvedValue(messages);

      const result = await controller.getMessages(user, 1);

      expect(result).toEqual(messages);
      expect(mockChatService.getMessages).toHaveBeenCalledWith(1, 1);
    });

    it('다른 사용자의 세션 접근 시 에러를 전파해야 한다', async () => {
      mockChatService.getMessages.mockRejectedValue(new ForbiddenException());

      await expect(controller.getMessages(user, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /chat/sessions/:id/messages', () => {
    it('SSE 헤더를 설정하고 스트리밍해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      mockChatService.sendMessageStream.mockResolvedValue(undefined);

      await controller.sendMessage(
        user,
        1,
        { content: '추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(mockRes.flushHeaders).toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('에러 시 error 이벤트를 전송해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      mockChatService.sendMessageStream.mockRejectedValue(new Error('API 오류'));

      await controller.sendMessage(
        user,
        1,
        { content: '추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: error'),
      );
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('DELETE /chat/sessions/:id', () => {
    it('세션을 삭제해야 한다', async () => {
      mockChatService.deleteSession.mockResolvedValue(undefined);

      const result = await controller.deleteSession(user, 1);

      expect(result).toEqual({ message: '세션이 삭제되었습니다.' });
      expect(mockChatService.deleteSession).toHaveBeenCalledWith(1, 1);
    });

    it('존재하지 않는 세션 삭제 시 에러를 전파해야 한다', async () => {
      mockChatService.deleteSession.mockRejectedValue(new NotFoundException());

      await expect(controller.deleteSession(user, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('가드 적용 확인', () => {
    it('컨트롤러 레벨에 JwtAuthGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', ChatController);
      expect(guards).toContainEqual(JwtAuthGuard);
    });

    it('컨트롤러 레벨에 ThrottlerGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', ChatController);
      expect(guards).toContainEqual(ThrottlerGuard);
    });

    it('createSession 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(ChatController.prototype.createSession);
      expect(allMetadataKeys.some((key: string) => key.toString().includes('THROTTLER'))).toBe(true);
    });

    it('sendMessage 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(ChatController.prototype.sendMessage);
      expect(allMetadataKeys.some((key: string) => key.toString().includes('THROTTLER'))).toBe(true);
    });
  });
});
