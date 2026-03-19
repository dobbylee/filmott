import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';

// Anthropic SDK mock
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        stream: jest.fn(),
      },
    })),
  };
});

describe('ChatService', () => {
  let service: ChatService;

  const mockSessionRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMessageRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockWatchlistRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockReviewRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-api-key'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(ChatSession), useValue: mockSessionRepo },
        { provide: getRepositoryToken(ChatMessage), useValue: mockMessageRepo },
        { provide: getRepositoryToken(Watchlist), useValue: mockWatchlistRepo },
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('새 세션을 생성해야 한다', async () => {
      mockSessionRepo.count.mockResolvedValue(0);
      const created = { id: 1, userId: 1, title: null, createdAt: new Date() };
      mockSessionRepo.create.mockReturnValue(created);
      mockSessionRepo.save.mockResolvedValue(created);

      const result = await service.createSession(1);

      expect(result).toEqual({
        id: 1,
        title: null,
        createdAt: created.createdAt,
      });
      expect(mockSessionRepo.create).toHaveBeenCalledWith({
        userId: 1,
        title: null,
      });
    });

    it('세션이 50개 이상이면 가장 오래된 세션을 삭제해야 한다', async () => {
      mockSessionRepo.count.mockResolvedValue(50);
      mockSessionRepo.find.mockResolvedValue([{ id: 10 }]);
      mockSessionRepo.delete.mockResolvedValue({ affected: 1 });

      const created = { id: 51, userId: 1, title: null, createdAt: new Date() };
      mockSessionRepo.create.mockReturnValue(created);
      mockSessionRepo.save.mockResolvedValue(created);

      await service.createSession(1);

      expect(mockSessionRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { updatedAt: 'ASC' },
        take: 1,
        select: ['id'],
      });
      expect(mockSessionRepo.delete).toHaveBeenCalledWith([10]);
    });

    it('세션이 50개 미만이면 삭제하지 않아야 한다', async () => {
      mockSessionRepo.count.mockResolvedValue(10);
      const created = { id: 11, userId: 1, title: null, createdAt: new Date() };
      mockSessionRepo.create.mockReturnValue(created);
      mockSessionRepo.save.mockResolvedValue(created);

      await service.createSession(1);

      expect(mockSessionRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('getSessions', () => {
    it('사용자의 세션 목록을 반환해야 한다', async () => {
      const sessions = [
        { id: 1, title: '테스트', updatedAt: new Date() },
        { id: 2, title: null, updatedAt: new Date() },
      ];

      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sessions),
      };
      mockSessionRepo.createQueryBuilder.mockReturnValue(mockQb);

      const lastMessages = [
        { sessionId: 1, content: '안녕하세요' },
      ];
      const mockMsgQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(lastMessages),
      };
      mockMessageRepo.createQueryBuilder.mockReturnValue(mockMsgQb);

      const result = await service.getSessions(1);

      expect(result).toHaveLength(2);
      expect(result[0].lastMessage).toBe('안녕하세요');
      expect(result[1].lastMessage).toBeNull();
    });

    it('세션이 없으면 빈 배열을 반환해야 한다', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockSessionRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getSessions(1);

      expect(result).toEqual([]);
    });
  });

  describe('getMessages', () => {
    it('세션의 메시지 이력을 반환해야 한다', async () => {
      const session = { id: 1, userId: 1 };
      mockSessionRepo.findOne.mockResolvedValue(session);

      const messages = [
        { id: 1, role: 'user', content: '안녕', createdAt: new Date() },
        { id: 2, role: 'assistant', content: '안녕하세요!', createdAt: new Date() },
      ];
      mockMessageRepo.find.mockResolvedValue(messages);

      const result = await service.getMessages(1, 1);

      expect(result).toHaveLength(2);
      expect(mockMessageRepo.find).toHaveBeenCalledWith({
        where: { sessionId: 1 },
        order: { createdAt: 'ASC' },
      });
    });

    it('다른 사용자의 세션에 접근하면 ForbiddenException을 던져야 한다', async () => {
      const session = { id: 1, userId: 2 };
      mockSessionRepo.findOne.mockResolvedValue(session);

      await expect(service.getMessages(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('존재하지 않는 세션이면 NotFoundException을 던져야 한다', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(service.getMessages(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSession', () => {
    it('세션을 삭제해야 한다', async () => {
      const session = { id: 1, userId: 1 };
      mockSessionRepo.findOne.mockResolvedValue(session);
      mockSessionRepo.delete.mockResolvedValue({ affected: 1 });

      await service.deleteSession(1, 1);

      expect(mockSessionRepo.delete).toHaveBeenCalledWith({ id: 1 });
    });

    it('다른 사용자의 세션 삭제 시 ForbiddenException을 던져야 한다', async () => {
      const session = { id: 1, userId: 2 };
      mockSessionRepo.findOne.mockResolvedValue(session);

      await expect(service.deleteSession(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('buildUserContext', () => {
    const mockQueryBuilder = () => ({
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    it('사용자 컨텍스트를 올바르게 구성해야 한다', async () => {
      const favoritesQb = mockQueryBuilder();
      favoritesQb.getRawMany.mockResolvedValue([
        { title: '기생충', releaseDate: '2019-05-30', genres: '드라마, 스릴러', rating: 10 },
      ]);

      const dislikedQb = mockQueryBuilder();
      dislikedQb.getRawMany.mockResolvedValue([
        { title: '영화X', releaseDate: '2020-01-01', genres: '액션', rating: 2 },
      ]);

      const genreStatsQb = mockQueryBuilder();
      genreStatsQb.getRawMany.mockResolvedValue([
        { genre: '드라마', avgRating: '8.5', count: '5' },
      ]);

      const watchedTmdbIdsQb = mockQueryBuilder();
      watchedTmdbIdsQb.getRawMany.mockResolvedValue([
        { tmdbId: 496243 },
      ]);

      const wantToWatchQb = mockQueryBuilder();
      wantToWatchQb.getRawMany.mockResolvedValue([
        { title: '인셉션', releaseDate: '2010-07-16' },
      ]);

      // reviewRepo는 favorites, disliked, genreStats에 사용됨 (순서대로 3번)
      mockReviewRepo.createQueryBuilder
        .mockReturnValueOnce(favoritesQb)
        .mockReturnValueOnce(dislikedQb)
        .mockReturnValueOnce(genreStatsQb);

      // watchlistRepo는 watchedTmdbIds, wantToWatch에 사용됨 (순서대로 2번)
      mockWatchlistRepo.createQueryBuilder
        .mockReturnValueOnce(watchedTmdbIdsQb)
        .mockReturnValueOnce(wantToWatchQb);

      const result = await service.buildUserContext(1);

      expect(result.favorites).toHaveLength(1);
      expect(result.favorites[0].title).toBe('기생충');
      expect(result.favorites[0].year).toBe('2019');
      expect(result.favorites[0].rating).toBe(10);

      expect(result.disliked).toHaveLength(1);
      expect(result.disliked[0].rating).toBe(2);

      expect(result.genreStats).toHaveLength(1);
      expect(result.genreStats[0].genre).toBe('드라마');
      expect(result.genreStats[0].count).toBe(5);

      expect(result.watchedTmdbIds).toEqual([496243]);

      expect(result.wantToWatch).toHaveLength(1);
      expect(result.wantToWatch[0].title).toBe('인셉션');
    });

    it('데이터가 없으면 빈 배열을 반환해야 한다', async () => {
      const emptyQb = mockQueryBuilder();

      mockReviewRepo.createQueryBuilder
        .mockReturnValueOnce(emptyQb)
        .mockReturnValueOnce(mockQueryBuilder())
        .mockReturnValueOnce(mockQueryBuilder());

      mockWatchlistRepo.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder())
        .mockReturnValueOnce(mockQueryBuilder());

      const result = await service.buildUserContext(1);

      expect(result.favorites).toEqual([]);
      expect(result.disliked).toEqual([]);
      expect(result.genreStats).toEqual([]);
      expect(result.watchedTmdbIds).toEqual([]);
      expect(result.wantToWatch).toEqual([]);
    });
  });

  describe('sendMessageStream', () => {
    it('SSE 이벤트를 올바른 순서로 emit해야 한다', async () => {
      // 세션 소유자 검증
      const session = { id: 1, userId: 1 };
      mockSessionRepo.findOne.mockResolvedValue(session);

      // 사용자 메시지 저장
      const userMessage = { id: 1, sessionId: 1, role: 'user', content: '추천해줘' };
      mockMessageRepo.create.mockReturnValue(userMessage);
      mockMessageRepo.save.mockResolvedValue(userMessage);

      // 첫 메시지 체크
      mockMessageRepo.count.mockResolvedValue(1);

      // 세션 title 업데이트
      mockSessionRepo.update.mockResolvedValue({ affected: 1 });

      // buildUserContext mocks
      const emptyQb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockReviewRepo.createQueryBuilder
        .mockReturnValueOnce({ ...emptyQb, getRawMany: jest.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ ...emptyQb, getRawMany: jest.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ ...emptyQb, getRawMany: jest.fn().mockResolvedValue([]) });

      mockWatchlistRepo.createQueryBuilder
        .mockReturnValueOnce({ ...emptyQb, getRawMany: jest.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ ...emptyQb, getRawMany: jest.fn().mockResolvedValue([]) });

      // User OTT
      mockUserRepo.findOne.mockResolvedValue({ id: 1, subscribedOtts: ['netflix'] });

      // Chat history
      mockMessageRepo.find.mockResolvedValue([
        { role: 'user', content: '추천해줘', createdAt: new Date() },
      ]);

      // Anthropic SDK mock stream
      const mockFinalMessage = {
        content: [
          { type: 'text', text: '좋은 작품을 골라봤어요.' },
          {
            type: 'tool_use',
            name: 'recommend_movies',
            input: {
              recommendations: [
                { tmdbId: 496243, contentType: 'movie', title: '기생충', reason: '명작입니다.' },
              ],
            },
          },
        ],
      };

      const mockStream = {
        on: jest.fn().mockImplementation(function (this: { _listeners: Record<string, ((...args: unknown[]) => void)[]> }, event: string, handler: (...args: unknown[]) => void) {
          if (!this._listeners) this._listeners = {};
          if (!this._listeners[event]) this._listeners[event] = [];
          this._listeners[event].push(handler);
          return this;
        }),
        _listeners: {} as Record<string, ((...args: unknown[]) => void)[]>,
        finalMessage: jest.fn().mockImplementation(async function (this: { _listeners: Record<string, ((...args: unknown[]) => void)[]> }) {
          // text 이벤트 트리거
          if (this._listeners?.text) {
            for (const handler of this._listeners.text) {
              handler('좋은 작품을 골라봤어요.');
            }
          }
          return mockFinalMessage;
        }),
      };

      // Anthropic SDK에 접근해서 stream mock 설정
      const anthropicInstance = (service as unknown as { anthropic: { messages: { stream: jest.Mock } } }).anthropic;
      anthropicInstance.messages.stream = jest.fn().mockReturnValue(mockStream);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      // AI 응답 메시지 저장
      const assistantMessage = { id: 2, sessionId: 1, role: 'assistant', content: '좋은 작품을 골라봤어요.' };
      mockMessageRepo.create.mockReturnValue(assistantMessage);
      mockMessageRepo.save.mockResolvedValue(assistantMessage);

      await service.sendMessageStream(1, 1, '추천해줘', emit);

      // text 이벤트 확인
      const textEvents = emittedEvents.filter((e) => e.event === 'text');
      expect(textEvents.length).toBeGreaterThan(0);

      // recommendations 이벤트 확인
      const recEvents = emittedEvents.filter((e) => e.event === 'recommendations');
      expect(recEvents).toHaveLength(1);

      // done 이벤트 확인
      const doneEvents = emittedEvents.filter((e) => e.event === 'done');
      expect(doneEvents).toHaveLength(1);
      expect((doneEvents[0].data as { messageId: number }).messageId).toBe(2);
    });

    it('다른 사용자의 세션에 메시지 전송 시 ForbiddenException을 던져야 한다', async () => {
      const session = { id: 1, userId: 2 };
      mockSessionRepo.findOne.mockResolvedValue(session);

      const emit = jest.fn();

      await expect(
        service.sendMessageStream(1, 1, '안녕', emit),
      ).rejects.toThrow(ForbiddenException);
    });

    it('첫 메시지일 때 세션 title을 자동 생성해야 한다', async () => {
      const session = { id: 1, userId: 1 };
      mockSessionRepo.findOne.mockResolvedValue(session);

      const userMessage = { id: 1, sessionId: 1, role: 'user', content: '비 오는 날에 볼 만한 영화 추천해줘' };
      mockMessageRepo.create.mockReturnValue(userMessage);
      mockMessageRepo.save.mockResolvedValue(userMessage);
      mockMessageRepo.count.mockResolvedValue(1);
      mockSessionRepo.update.mockResolvedValue({ affected: 1 });

      // buildUserContext mocks
      const emptyQb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockReviewRepo.createQueryBuilder.mockReturnValue(emptyQb);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(emptyQb);
      mockUserRepo.findOne.mockResolvedValue({ id: 1, subscribedOtts: [] });
      mockMessageRepo.find.mockResolvedValue([
        { role: 'user', content: '비 오는 날에 볼 만한 영화 추천해줘', createdAt: new Date() },
      ]);

      const mockStream = {
        on: jest.fn().mockReturnThis(),
        finalMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '응답' }] }),
      };

      const anthropicInstance = (service as unknown as { anthropic: { messages: { stream: jest.Mock } } }).anthropic;
      anthropicInstance.messages.stream = jest.fn().mockReturnValue(mockStream);

      const assistantMessage = { id: 2, sessionId: 1, role: 'assistant', content: '응답' };
      mockMessageRepo.create.mockReturnValue(assistantMessage);
      mockMessageRepo.save.mockResolvedValue(assistantMessage);

      await service.sendMessageStream(1, 1, '비 오는 날에 볼 만한 영화 추천해줘', jest.fn());

      // 첫 호출은 세션 title 업데이트 (30자 넘으므로 잘림)
      expect(mockSessionRepo.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: expect.stringContaining('비 오는 날에') }),
      );
    });
  });
});
