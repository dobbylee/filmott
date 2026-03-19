import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { EmbeddingService, SimilarContent } from './embedding.service';
import { ContentsService } from '../contents/contents.service';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import { Content } from '../contents/content.entity';

// OpenAI SDK mock
const mockStreamCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockStreamCreate,
        },
      },
    })),
  };
});

describe('ChatService', () => {
  let service: ChatService;

  const mockEmbeddingService = {
    searchSimilar: jest.fn(),
    cacheContentMetadata: jest.fn().mockResolvedValue(undefined),
  };

  const mockContentsService = {
    findOrFetchByTmdbId: jest.fn(),
    searchContents: jest.fn(),
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

  const mockContentRepo = {
    findOne: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-openai-key'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: ContentsService, useValue: mockContentsService },
        { provide: getRepositoryToken(Watchlist), useValue: mockWatchlistRepo },
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
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

      mockReviewRepo.createQueryBuilder
        .mockReturnValueOnce(favoritesQb)
        .mockReturnValueOnce(dislikedQb)
        .mockReturnValueOnce(genreStatsQb);

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
    const setupEmptyUserContext = () => {
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
      mockUserRepo.findOne.mockResolvedValue({ id: 1, subscribedOtts: ['netflix'] });
    };

    it('SSE 이벤트를 올바른 순서로 emit해야 한다', async () => {
      setupEmptyUserContext();

      const candidates: SimilarContent[] = [
        {
          contentId: 1,
          tmdbId: 496243,
          contentType: 'movie',
          title: '기생충',
          posterUrl: '/poster.jpg',
          genres: [{ id: 18, name: '드라마' }],
          voteAverage: 8.6,
          description: '어두운 스릴러',
          similarity: 0.95,
        },
      ];
      mockEmbeddingService.searchSimilar.mockResolvedValue(candidates);

      // OpenAI 스트리밍 mock — async iterable
      const chunks = [
        { choices: [{ delta: { content: '좋은 영화를 추천해 드릴게요! ' } }] },
        { choices: [{ delta: { content: '---RECOMMENDATIONS---\n' } }] },
        { choices: [{ delta: { content: '[{"tmdbId": 496243, "contentType": "movie"}]' } }] },
        { choices: [{ delta: { content: '\n---END---' } }] },
      ];

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '추천해줘', [], emit);

      // text 이벤트 확인
      const textEvents = emittedEvents.filter((e) => e.event === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      expect((textEvents[0].data as { content: string }).content).toContain('좋은 영화');

      // recommendations 이벤트 확인
      const recEvents = emittedEvents.filter((e) => e.event === 'recommendations');
      expect(recEvents).toHaveLength(1);
      const recs = (recEvents[0].data as { recommendations: { tmdbId: number }[] }).recommendations;
      expect(recs[0].tmdbId).toBe(496243);

      // done 이벤트 확인
      const doneEvents = emittedEvents.filter((e) => e.event === 'done');
      expect(doneEvents).toHaveLength(1);
    });

    it('OPENAI_API_KEY가 없으면 BadRequestException을 던져야 한다', async () => {
      // API 키가 빈 문자열인 새 서비스 인스턴스 생성
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ChatService,
          { provide: EmbeddingService, useValue: mockEmbeddingService },
          { provide: ContentsService, useValue: mockContentsService },
          { provide: getRepositoryToken(Watchlist), useValue: mockWatchlistRepo },
          { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
          { provide: getRepositoryToken(User), useValue: mockUserRepo },
          { provide: getRepositoryToken(Content), useValue: mockContentRepo },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        ],
      }).compile();

      const noKeyService = module.get<ChatService>(ChatService);

      await expect(
        noKeyService.sendMessageStream(1, '안녕', [], jest.fn()),
      ).rejects.toThrow(BadRequestException);
    });

    it('대화 이력(history)을 포함하여 OpenAI에 전달해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '안녕하세요!' } }] };
        },
      });

      const history = [
        { role: 'user' as const, content: '이전 질문' },
        { role: 'assistant' as const, content: '이전 답변' },
      ];

      await service.sendMessageStream(1, '새 질문', history, jest.fn());

      expect(mockStreamCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user', content: '이전 질문' }),
            expect.objectContaining({ role: 'assistant', content: '이전 답변' }),
            expect.objectContaining({ role: 'user', content: '새 질문' }),
          ]),
        }),
      );
    });
  });

  describe('extractRecommendations', () => {
    it('응답에서 추천 JSON 블록을 파싱해야 한다', async () => {
      const text = '추천 드립니다.\n---RECOMMENDATIONS---\n[{"tmdbId": 496243, "contentType": "movie"}]\n---END---';
      const candidates: SimilarContent[] = [
        {
          contentId: 1,
          tmdbId: 496243,
          contentType: 'movie',
          title: '기생충',
          posterUrl: '/poster.jpg',
          genres: [{ id: 18, name: '드라마' }],
          voteAverage: 8.6,
          description: '어두운 스릴러',
          similarity: 0.95,
        },
      ];

      const result = await service.extractRecommendations(text, candidates);

      expect(result).toHaveLength(1);
      expect(result[0].tmdbId).toBe(496243);
      expect(result[0].title).toBe('기생충');
      expect(result[0].posterUrl).toBe('/poster.jpg');
    });

    it('마커가 없으면 빈 배열을 반환해야 한다', async () => {
      const result = await service.extractRecommendations('일반 대화입니다.', []);
      expect(result).toEqual([]);
    });

    it('후보에 없는 tmdbId는 필터링해야 한다', async () => {
      const text = '---RECOMMENDATIONS---\n[{"tmdbId": 999, "contentType": "movie"}]\n---END---';
      // ContentsService.findOrFetchByTmdbId가 실패하는 시나리오 (후보에 없고 TMDB도 없음)
      mockContentsService.findOrFetchByTmdbId.mockRejectedValueOnce(new Error('Not found'));
      const result = await service.extractRecommendations(text, []);
      expect(result).toEqual([]);
    });

    it('잘못된 JSON이면 빈 배열을 반환해야 한다', async () => {
      const text = '---RECOMMENDATIONS---\n{invalid json}\n---END---';
      const result = await service.extractRecommendations(text, []);
      expect(result).toEqual([]);
    });

    it('후보에 없는 tmdbId는 ContentsService로 조회해야 한다', async () => {
      const text = '---RECOMMENDATIONS---\n[{"tmdbId": 12345, "contentType": "movie", "title": "새 영화"}]\n---END---';
      mockContentsService.findOrFetchByTmdbId.mockResolvedValueOnce({
        id: 99,
        title: '새 영화',
        posterUrl: '/new-poster.jpg',
      });

      const result = await service.extractRecommendations(text, []);

      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(12345, 'movie');
      expect(result).toHaveLength(1);
      expect(result[0].tmdbId).toBe(12345);
      expect(result[0].title).toBe('새 영화');
      expect(result[0].posterUrl).toBe('/new-poster.jpg');
    });

    it('여러 추천을 병렬로 처리해야 한다', async () => {
      const text = '---RECOMMENDATIONS---\n[{"tmdbId": 111, "contentType": "movie", "title": "영화1"},{"tmdbId": 222, "contentType": "tv", "title": "드라마1"}]\n---END---';
      const candidates: SimilarContent[] = [
        {
          contentId: 1,
          tmdbId: 111,
          contentType: 'movie',
          title: '영화1',
          posterUrl: '/poster1.jpg',
          genres: [],
          voteAverage: 7.0,
          description: '설명1',
          similarity: 0.9,
        },
      ];

      // tmdbId 222는 후보에 없으므로 findOrFetchByTmdbId 호출
      mockContentsService.findOrFetchByTmdbId.mockResolvedValueOnce({
        id: 2,
        tmdbId: 222,
        title: '드라마1',
        posterUrl: '/poster2.jpg',
      });

      const result = await service.extractRecommendations(text, candidates);

      expect(result).toHaveLength(2);
      expect(result[0].tmdbId).toBe(111);
      expect(result[1].tmdbId).toBe(222);
    });

    it('tmdbId가 0이면 제목으로 TMDB 검색 fallback해야 한다', async () => {
      const text = '---RECOMMENDATIONS---\n[{"tmdbId": 0, "contentType": "movie", "title": "기생충"}]\n---END---';

      mockContentsService.searchContents.mockResolvedValueOnce({
        results: [{ id: 496243, media_type: 'movie', title: '기생충' }],
      });
      mockContentsService.findOrFetchByTmdbId.mockResolvedValueOnce({
        id: 1,
        tmdbId: 496243,
        title: '기생충',
        posterUrl: '/parasite.jpg',
      });

      const result = await service.extractRecommendations(text, []);

      expect(mockContentsService.searchContents).toHaveBeenCalledWith('기생충', 'movie', 1);
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(496243, 'movie');
      expect(result).toHaveLength(1);
      expect(result[0].tmdbId).toBe(496243);
      expect(result[0].posterUrl).toBe('/parasite.jpg');
    });

    it('TMDB ID 조회 실패 시 제목으로 검색 fallback해야 한다', async () => {
      const text = '---RECOMMENDATIONS---\n[{"tmdbId": 999, "contentType": "movie", "title": "미지의 영화"}]\n---END---';

      // findOrFetchByTmdbId 첫 호출 실패 (tmdbId=999)
      mockContentsService.findOrFetchByTmdbId.mockRejectedValueOnce(new Error('Not found'));
      // searchContents로 제목 검색
      mockContentsService.searchContents.mockResolvedValueOnce({
        results: [{ id: 555, media_type: 'movie', title: '미지의 영화' }],
      });
      // 검색된 tmdbId로 다시 findOrFetchByTmdbId
      mockContentsService.findOrFetchByTmdbId.mockResolvedValueOnce({
        id: 10,
        tmdbId: 555,
        title: '미지의 영화',
        posterUrl: '/unknown.jpg',
      });

      const result = await service.extractRecommendations(text, []);

      expect(result).toHaveLength(1);
      expect(result[0].tmdbId).toBe(555);
      expect(result[0].title).toBe('미지의 영화');
    });

    it('제목 검색도 실패하면 제목만으로 카드를 생성해야 한다', async () => {
      const text = '---RECOMMENDATIONS---\n[{"tmdbId": 0, "contentType": "movie", "title": "존재하지 않는 영화"}]\n---END---';

      mockContentsService.searchContents.mockResolvedValueOnce({
        results: [],
      });

      const result = await service.extractRecommendations(text, []);

      expect(result).toHaveLength(1);
      expect(result[0].tmdbId).toBe(0);
      expect(result[0].title).toBe('존재하지 않는 영화');
      expect(result[0].posterUrl).toBeNull();
    });
  });
});
