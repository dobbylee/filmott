import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

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
        on: jest.fn(),
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
        on: jest.fn(),
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
        expect.any(AbortSignal),
      );
    });

    it('history가 없으면 빈 배열을 전달해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
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
        expect.any(AbortSignal),
      );
    });

    it('에러 시 error 이벤트를 전송해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
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
        on: jest.fn(),
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

    it('비로그인(user=null) 시 userId를 null로 전달해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      mockChatService.sendMessageStream.mockResolvedValue(undefined);

      await controller.sendMessage(
        null,
        { content: '영화 추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockChatService.sendMessageStream).toHaveBeenCalledWith(
        null,
        '영화 추천해줘',
        [],
        expect.any(Function),
        expect.any(AbortSignal),
      );
    });

    it('비로그인 시에도 SSE 헤더를 설정하고 정상 응답해야 한다', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      mockChatService.sendMessageStream.mockResolvedValue(undefined);

      await controller.sendMessage(
        null,
        { content: '재밌는 드라마 알려줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.flushHeaders).toHaveBeenCalled();
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('가드 적용 확인', () => {
    it('컨트롤러 레벨에 OptionalJwtAuthGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', ChatController);
      expect(guards).toContainEqual(OptionalJwtAuthGuard);
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

  describe('SSE 연결 끊김 처리', () => {
    it('sendMessageStream에 AbortSignal을 전달해야 한다', async () => {
      const closeHandler = jest.fn();
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'close') closeHandler.mockImplementation(handler);
        }),
      };

      mockChatService.sendMessageStream.mockResolvedValue(undefined);

      await controller.sendMessage(
        user,
        { content: '추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      expect(mockRes.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockChatService.sendMessageStream).toHaveBeenCalledWith(
        1,
        '추천해줘',
        [],
        expect.any(Function),
        expect.any(AbortSignal),
      );
    });

    it('연결 끊김 후 write를 호출하지 않아야 한다', async () => {
      let closeCallback: (() => void) | undefined;
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'close') closeCallback = handler;
        }),
      };

      mockChatService.sendMessageStream.mockImplementation(
        async (_userId: number, _content: string, _history: unknown[], emit: (event: string, data: unknown) => void) => {
          // 첫 emit 후 연결 끊김 시뮬레이션
          emit('text', { content: 'test' });
          if (closeCallback) closeCallback();
          emit('text', { content: 'should not write' });
        },
      );

      await controller.sendMessage(
        user,
        { content: '추천해줘' },
        mockRes as unknown as import('express').Response,
      );

      // 첫 번째 write만 실행되어야 함 (두 번째는 aborted 상태)
      const writeCalls = mockRes.write.mock.calls;
      expect(writeCalls).toHaveLength(1);
      expect(writeCalls[0][0]).toContain('test');
    });
  });
});
