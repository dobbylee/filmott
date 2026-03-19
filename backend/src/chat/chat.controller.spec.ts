import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('ChatController', () => {
  let controller: ChatController;

  const mockChatService = {
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

  describe('POST /chat/messages', () => {
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

    it('sendMessageStream에 올바른 인자를 전달해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      mockChatService.sendMessageStream.mockResolvedValue(undefined);

      const history = [
        { role: 'user' as const, content: '이전 질문' },
      ];

      await controller.sendMessage(
        user,
        { content: '새 질문', history },
        mockRes as unknown as import('express').Response,
      );

      expect(mockChatService.sendMessageStream).toHaveBeenCalledWith(
        1,
        '새 질문',
        history,
        expect.any(Function),
      );
    });

    it('history가 없으면 빈 배열을 전달해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      mockChatService.sendMessageStream.mockResolvedValue(undefined);

      await controller.sendMessage(
        user,
        { content: '추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockChatService.sendMessageStream).toHaveBeenCalledWith(
        1,
        '추천해줘',
        [],
        expect.any(Function),
      );
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
        { content: '추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: error'),
      );
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('Error가 아닌 에러 시 기본 메시지를 전송해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      mockChatService.sendMessageStream.mockRejectedValue('문자열 에러');

      await controller.sendMessage(
        user,
        { content: '추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('추천 중 오류가 발생했습니다'),
      );
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

    it('sendMessage 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(ChatController.prototype.sendMessage);
      expect(allMetadataKeys.some((key: string) => key.toString().includes('THROTTLER'))).toBe(true);
    });
  });
});
