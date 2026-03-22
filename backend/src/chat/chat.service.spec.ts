import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChatService } from './chat.service';
import { EmbeddingService, SimilarContent } from './embedding.service';
import { ContentSearchService } from './content-search.service';
import { IntentAnalyzerService, ParsedIntent } from './intent-analyzer';
import { ContentsService } from '../contents/contents.service';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import { Content } from '../contents/content.entity';
import { UserPreference } from './user-preference';

// extractUserPreference mock
const mockExtractUserPreference = jest.fn<UserPreference, []>();
jest.mock('./user-preference', () => ({
  extractUserPreference: (...args: unknown[]) => mockExtractUserPreference(...(args as [])),
  enrichQueryWithPreference: (query: string) => query,
}));

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
    hasAnyMetadata: jest.fn(),
    searchSimilar: jest.fn(),
    cacheContentMetadata: jest.fn().mockResolvedValue(undefined),
  };

  const mockContentSearchService = {
    searchWithFilters: jest.fn(),
  };

  const mockIntentAnalyzerService = {
    analyzeIntent: jest.fn(),
    buildSemanticQuery: jest.fn(),
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

  const mockDataSource = {
    query: jest.fn().mockResolvedValue([]),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-openai-key'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: ContentSearchService, useValue: mockContentSearchService },
        { provide: IntentAnalyzerService, useValue: mockIntentAnalyzerService },
        { provide: ContentsService, useValue: mockContentsService },
        { provide: getRepositoryToken(Watchlist), useValue: mockWatchlistRepo },
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
        { provide: DataSource, useValue: mockDataSource },
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
      leftJoin: jest.fn().mockReturnThis(),
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
        { title: '기생충', releaseDate: '2019-05-30', genres: '드라마, 스릴러', rating: 10, originCountry: 'KR' },
      ]);

      const dislikedQb = mockQueryBuilder();
      dislikedQb.getRawMany.mockResolvedValue([
        { title: '영화X', releaseDate: '2020-01-01', genres: '액션', rating: 2, originCountry: 'US' },
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
        { title: '인셉션', releaseDate: '2010-07-16', genres: 'SF, 액션', originCountry: 'US' },
      ]);

      const watchedGenresQb = mockQueryBuilder();
      watchedGenresQb.getRawMany.mockResolvedValue([
        { genre: '코미디', avgRating: '0', count: '3' },
      ]);

      mockReviewRepo.createQueryBuilder
        .mockReturnValueOnce(favoritesQb)
        .mockReturnValueOnce(dislikedQb)
        .mockReturnValueOnce(genreStatsQb);

      mockWatchlistRepo.createQueryBuilder
        .mockReturnValueOnce(watchedTmdbIdsQb)
        .mockReturnValueOnce(wantToWatchQb)
        .mockReturnValueOnce(watchedGenresQb);

      const result = await service.buildUserContext(1);

      expect(result.favorites).toHaveLength(1);
      expect(result.favorites[0].title).toBe('기생충');
      expect(result.favorites[0].year).toBe('2019');
      expect(result.favorites[0].rating).toBe(10);
      expect(result.favorites[0].originCountry).toBe('KR');

      expect(result.disliked).toHaveLength(1);
      expect(result.disliked[0].rating).toBe(2);
      expect(result.disliked[0].originCountry).toBe('US');

      expect(result.genreStats).toHaveLength(1);
      expect(result.genreStats[0].genre).toBe('드라마');
      expect(result.genreStats[0].count).toBe(5);

      expect(result.watchedTmdbIds).toEqual([496243]);

      expect(result.wantToWatch).toHaveLength(1);
      expect(result.wantToWatch[0].title).toBe('인셉션');
      expect(result.wantToWatch[0].genres).toBe('SF, 액션');
      expect(result.wantToWatch[0].originCountry).toBe('US');

      expect(result.watchedGenres).toHaveLength(1);
      expect(result.watchedGenres[0].genre).toBe('코미디');
      expect(result.watchedGenres[0].count).toBe(3);
    });

    it('데이터가 없으면 빈 배열을 반환해야 한다', async () => {
      const emptyQb = mockQueryBuilder();

      mockReviewRepo.createQueryBuilder
        .mockReturnValueOnce(emptyQb)
        .mockReturnValueOnce(mockQueryBuilder())
        .mockReturnValueOnce(mockQueryBuilder());

      mockWatchlistRepo.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder())
        .mockReturnValueOnce(mockQueryBuilder())
        .mockReturnValueOnce(mockQueryBuilder());

      const result = await service.buildUserContext(1);

      expect(result.favorites).toEqual([]);
      expect(result.disliked).toEqual([]);
      expect(result.genreStats).toEqual([]);
      expect(result.watchedTmdbIds).toEqual([]);
      expect(result.wantToWatch).toEqual([]);
      expect(result.watchedGenres).toEqual([]);
    });
  });

  describe('sendMessageStream', () => {
    const emptyIntent: ParsedIntent = {
      ottProviderNames: [],
      countries: [],
      excludeCountries: [],
      personNames: [],
      referenceTitles: [],
      dateRange: null,
      contentType: null,
      genres: [],
    };

    const defaultEmptyPreference: UserPreference = {
      preferredGenres: [],
      preferredCountries: [],
      ottProviderNames: [],
      hasData: false,
    };

    const setupEmptyUserContext = () => {
      const emptyQb = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
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
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(true);
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({ ...emptyIntent });
      mockIntentAnalyzerService.buildSemanticQuery.mockImplementation((query: string) => query);
      mockExtractUserPreference.mockReturnValue({ ...defaultEmptyPreference });
    };

    it('볼드 제목이 후보와 매칭되면 text/recommendations/done 이벤트를 순서대로 emit해야 한다', async () => {
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
          director: '봉준호',
          originCountry: 'KR',
          overview: null,
        },
      ];
      mockEmbeddingService.searchSimilar.mockResolvedValue(candidates);

      // OpenAI 스트리밍 mock: 볼드 제목을 포함한 텍스트만
      const chunks = [
        { choices: [{ delta: { content: '좋은 영화를 추천해 드릴게요!\n\n' } }] },
        { choices: [{ delta: { content: '**기생충 (Parasite)** — 봉준호 감독의 걸작입니다.' } }] },
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

      // recommendations 이벤트 확인 (후보 매칭 성공 시)
      const recEvents = emittedEvents.filter((e) => e.event === 'recommendations');
      expect(recEvents).toHaveLength(1);
      const recs = (recEvents[0].data as { recommendations: { tmdbId: number }[] }).recommendations;
      expect(recs[0].tmdbId).toBe(496243);

      // done 이벤트 확인
      const doneEvents = emittedEvents.filter((e) => e.event === 'done');
      expect(doneEvents).toHaveLength(1);
    });

    it('function call 없이 텍스트만 있으면 recommendations 이벤트를 emit하지 않아야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      const chunks = [
        { choices: [{ delta: { content: '네, 어떤 장르를 좋아하시나요?' } }] },
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

      await service.sendMessageStream(1, '안녕', [], emit);

      const recEvents = emittedEvents.filter((e) => e.event === 'recommendations');
      expect(recEvents).toHaveLength(0);

      const doneEvents = emittedEvents.filter((e) => e.event === 'done');
      expect(doneEvents).toHaveLength(1);
    });

    it('content_metadata가 비어있으면 임베딩 검색을 스킵해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(false);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천해 드릴게요.' } }] };
        },
      });

      await service.sendMessageStream(1, '추천해줘', [], jest.fn());

      expect(mockEmbeddingService.hasAnyMetadata).toHaveBeenCalled();
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('OPENAI_API_KEY가 없으면 BadRequestException을 던져야 한다', async () => {
      // API 키가 빈 문자열인 새 서비스 인스턴스 생성
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ChatService,
          { provide: EmbeddingService, useValue: mockEmbeddingService },
          { provide: ContentSearchService, useValue: mockContentSearchService },
          { provide: IntentAnalyzerService, useValue: mockIntentAnalyzerService },
          { provide: ContentsService, useValue: mockContentsService },
          { provide: getRepositoryToken(Watchlist), useValue: mockWatchlistRepo },
          { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
          { provide: getRepositoryToken(User), useValue: mockUserRepo },
          { provide: getRepositoryToken(Content), useValue: mockContentRepo },
          { provide: DataSource, useValue: mockDataSource },
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

    it('OTT 키워드가 있는 메시지는 ContentSearchService.searchWithFilters를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('볼만한 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '넷플릭스 추천!' } }] };
        },
      });

      await service.sendMessageStream(1, '넷플릭스에서 볼만한 영화', [], jest.fn());

      expect(mockIntentAnalyzerService.analyzeIntent).toHaveBeenCalled();
      expect(mockIntentAnalyzerService.buildSemanticQuery).toHaveBeenCalled();
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        '볼만한 영화',
        20,
        expect.any(Array),
        expect.objectContaining({ ottProviderNames: ['Netflix'] }),
        undefined,
      );
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('필터 없는 메시지는 EmbeddingService.searchSimilar를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({ ...emptyIntent });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('재미있는 영화');
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천해 드릴게요.' } }] };
        },
      });

      await service.sendMessageStream(1, '재미있는 영화 추천해줘', [], jest.fn());

      expect(mockIntentAnalyzerService.analyzeIntent).toHaveBeenCalled();
      expect(mockEmbeddingService.searchSimilar).toHaveBeenCalledWith(
        '재미있는 영화',
        20,
        expect.any(Array),
        undefined,
        undefined,
      );
      expect(mockContentSearchService.searchWithFilters).not.toHaveBeenCalled();
    });

    it('analyzeIntent가 국가/인물/연도 의도를 반환하면 ContentSearchService.searchWithFilters를 호출해야 한다', async () => {
      setupEmptyUserContext();
      const intentResult: ParsedIntent = {
        ...emptyIntent,
        countries: ['KR'],
        personNames: ['봉준호'],
        dateRange: { from: '2020-01-01', to: null },
        contentType: 'movie',
      };
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue(intentResult);
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('감독 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천합니다.' } }] };
        },
      });

      await service.sendMessageStream(1, '봉준호 감독의 최신 한국 영화', [], jest.fn());

      expect(mockIntentAnalyzerService.buildSemanticQuery).toHaveBeenCalledWith(
        expect.any(String),
        intentResult,
      );
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        '감독 영화',
        20,
        expect.any(Array),
        expect.objectContaining({
          countries: ['KR'],
          personNames: ['봉준호'],
          dateRange: { from: '2020-01-01', to: null },
          contentType: 'movie',
        }),
        undefined,
      );
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('searchWithFilters에 buildSemanticQuery로 정제된 쿼리를 전달해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        personNames: ['봉준호'],
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('사회 풍자 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천합니다.' } }] };
        },
      });

      await service.sendMessageStream(
        1,
        '넷플릭스에서 봉준호 감독의 한국 사회 풍자 영화',
        [],
        jest.fn(),
      );

      // buildSemanticQuery가 원본 쿼리 + intent로 호출되는지 확인
      expect(mockIntentAnalyzerService.buildSemanticQuery).toHaveBeenCalledWith(
        '넷플릭스에서 봉준호 감독의 한국 사회 풍자 영화',
        expect.objectContaining({
          ottProviderNames: ['Netflix'],
          countries: ['KR'],
          personNames: ['봉준호'],
        }),
      );

      // searchWithFilters에 정제된 쿼리가 전달되는지 확인
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        '사회 풍자 영화',
        20,
        expect.any(Array),
        expect.objectContaining({
          ottProviderNames: ['Netflix'],
          countries: ['KR'],
          personNames: ['봉준호'],
        }),
        undefined,
      );
    });

    it('content_metadata가 없으면 analyzeIntent를 호출하지 않아야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(false);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천해 드릴게요.' } }] };
        },
      });

      await service.sendMessageStream(1, '추천해줘', [], jest.fn());

      expect(mockIntentAnalyzerService.analyzeIntent).not.toHaveBeenCalled();
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('dateRange.to만 있는 의도면 ContentSearchService.searchWithFilters를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        dateRange: { from: null, to: '1999-12-31' },
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('90년대 이전 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천합니다.' } }] };
        },
      });

      await service.sendMessageStream(1, '90년대 이전 영화', [], jest.fn());

      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        '90년대 이전 영화',
        20,
        expect.any(Array),
        expect.objectContaining({
          dateRange: { from: null, to: '1999-12-31' },
        }),
        undefined,
      );
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('genres 필터가 포함된 복합 의도 시 ContentSearchService.searchWithFilters를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        genres: ['공포', '스릴러'],
        contentType: 'movie',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('무서운 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '공포 영화 추천!' } }] };
        },
      });

      await service.sendMessageStream(1, '호러 스릴러 영화 추천해줘', [], jest.fn());

      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        '무서운 영화',
        20,
        expect.any(Array),
        expect.objectContaining({
          genres: ['공포', '스릴러'],
          contentType: 'movie',
        }),
        undefined,
      );
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('필터 없음 + 유저 데이터 있음: ContentSearchService.searchWithFilters가 유저 선호를 WHERE 필터로 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        preferredGenres: ['드라마', '스릴러'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({ ...emptyIntent });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('잔잔한 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천해 드릴게요.' } }] };
        },
      });

      await service.sendMessageStream(1, '비 오는 날에 볼 만한 잔잔한 영화', [], jest.fn());

      // 유저 선호가 WHERE 필터 필드에 합쳐져서 전달되어야 한다
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        '잔잔한 영화',
        20,
        expect.any(Array),
        expect.objectContaining({
          ottProviderNames: ['Netflix'],
          genres: ['드라마', '스릴러'],
          countries: ['KR'],
        }),
        undefined,
      );
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('필터 없음 + 신규 유저: EmbeddingService.searchSimilar가 호출되어야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        preferredGenres: [],
        preferredCountries: [],
        ottProviderNames: [],
        hasData: false,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({ ...emptyIntent });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('재미있는 영화');
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천해 드릴게요.' } }] };
        },
      });

      await service.sendMessageStream(1, '재미있는 영화 추천해줘', [], jest.fn());

      expect(mockEmbeddingService.searchSimilar).toHaveBeenCalledWith(
        '재미있는 영화',
        20,
        expect.any(Array),
        undefined,
        undefined,
      );
      expect(mockContentSearchService.searchWithFilters).not.toHaveBeenCalled();
    });

    it('필터 있음: 명시적 필터가 유저 선호보다 우선해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        preferredGenres: ['드라마'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        ottProviderNames: ['Disney Plus'],
        countries: ['US'],
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('히어로 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천합니다.' } }] };
        },
      });

      await service.sendMessageStream(1, '디즈니플러스 미국 히어로 영화', [], jest.fn());

      const calledFilters = mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // 명시적 필터가 있는 필드에는 유저 선호가 합쳐지지 않는다
      expect(calledFilters.ottProviderNames).toEqual(['Disney Plus']);
      expect(calledFilters.countries).toEqual(['US']);
      // 명시적 필터가 없는 필드에는 유저 선호가 WHERE 필터로 적용된다
      expect(calledFilters.genres).toEqual(['드라마']);
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('명시적 OTT 필터 있음: 유저 장르/국가 선호는 WHERE 필터에 합쳐져야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        preferredGenres: ['드라마', '로맨스'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        ottProviderNames: ['Tving'],
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('로맨스 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천합니다.' } }] };
        },
      });

      await service.sendMessageStream(1, '티빙에서 볼만한 영화', [], jest.fn());

      const calledFilters = mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // 명시적 OTT(Tving)가 유저 구독 OTT(Netflix)를 덮어야 한다
      expect(calledFilters.ottProviderNames).toEqual(['Tving']);
      // 명시적 필터가 없는 장르/국가는 유저 선호가 WHERE 필터로 합쳐져야 한다
      expect(calledFilters.genres).toEqual(['드라마', '로맨스']);
      expect(calledFilters.countries).toEqual(['KR']);
    });

    it('유저 OTT 구독만 있고 장르/국가 선호 없는 경우 OTT 필터만 적용해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        preferredGenres: [],
        preferredCountries: [],
        ottProviderNames: ['wavve'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({ ...emptyIntent });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('추천 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천합니다.' } }] };
        },
      });

      await service.sendMessageStream(1, '오늘 볼 영화 추천해줘', [], jest.fn());

      const calledFilters = mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // 유저 구독 OTT가 WHERE 필터로 적용되어야 한다
      expect(calledFilters.ottProviderNames).toEqual(['wavve']);
      // 선호 없는 장르/국가는 필터에 포함되지 않아야 한다
      expect(calledFilters.genres).toBeUndefined();
      expect(calledFilters.countries).toBeUndefined();
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('extractUserPreference가 올바른 인자로 호출되어야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천해 드릴게요.' } }] };
        },
      });

      await service.sendMessageStream(1, '추천해줘', [], jest.fn());

      expect(mockExtractUserPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          favorites: expect.any(Array),
          genreStats: expect.any(Array),
          watchedTmdbIds: expect.any(Array),
        }),
        ['netflix'],
      );
    });
  });

  describe('extractTitlesFromText', () => {
    it('볼드 제목을 올바르게 추출해야 한다', () => {
      const text = '**기생충 (Parasite)** — 봉준호 감독 걸작.\n**인셉션 (Inception)** — 꿈 속의 꿈.';
      const result = service.extractTitlesFromText(text);

      expect(result).toHaveLength(2);
      expect(result[0].korean).toBe('기생충');
      expect(result[0].english).toBe('Parasite');
      expect(result[1].korean).toBe('인셉션');
      expect(result[1].english).toBe('Inception');
    });

    it('영어 원제 없는 볼드 제목도 추출해야 한다', () => {
      const text = '**기생충** — 감동적인 영화입니다.';
      const result = service.extractTitlesFromText(text);

      expect(result).toHaveLength(1);
      expect(result[0].korean).toBe('기생충');
      expect(result[0].english).toBeNull();
    });

    it('최대 5개까지만 추출해야 한다', () => {
      const text = '**작품1** **작품2** **작품3** **작품4** **작품5** **작품6**';
      const result = service.extractTitlesFromText(text);

      expect(result).toHaveLength(5);
    });

    it('중복 제목은 한 번만 추출해야 한다', () => {
      const text = '**기생충 (Parasite)** 설명.\n**기생충** 다시 언급.';
      const result = service.extractTitlesFromText(text);

      expect(result).toHaveLength(1);
    });

    it('볼드 제목이 없으면 빈 배열을 반환해야 한다', () => {
      const result = service.extractTitlesFromText('일반 텍스트입니다.');
      expect(result).toEqual([]);
    });

    it('3자 미만의 볼드 텍스트는 무시해야 한다', () => {
      const text = '**AB** 이것은 제목이 아닙니다. **기생충** 이것은 제목입니다.';
      const result = service.extractTitlesFromText(text);

      expect(result).toHaveLength(1);
      expect(result[0].korean).toBe('기생충');
    });
  });

  describe('matchTitlesToCandidates', () => {
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
        director: '봉준호',
        originCountry: 'KR',
        overview: null,
      },
      {
        contentId: 2,
        tmdbId: 27205,
        contentType: 'movie',
        title: 'Inception',
        posterUrl: '/inception.jpg',
        genres: [{ id: 28, name: '액션' }],
        voteAverage: 8.8,
        description: '꿈의 세계',
        similarity: 0.92,
        director: '크리스토퍼 놀란',
        originCountry: 'US',
        overview: null,
      },
    ];

    it('한국어 제목으로 후보를 정확 매칭해야 한다', () => {
      const titles = [{ korean: '기생충', english: 'Parasite' }];
      const { matched, unmatched } = service.matchTitlesToCandidates(titles, candidates);

      expect(matched).toHaveLength(1);
      expect(matched[0].tmdbId).toBe(496243);
      expect(matched[0].title).toBe('기생충');
      expect(matched[0].posterUrl).toBe('/poster.jpg');
      expect(unmatched).toHaveLength(0);
    });

    it('영어 원제로 후보를 정확 매칭해야 한다', () => {
      const titles = [{ korean: '인셉션', english: 'Inception' }];
      const { matched, unmatched } = service.matchTitlesToCandidates(titles, candidates);

      expect(matched).toHaveLength(1);
      expect(matched[0].tmdbId).toBe(27205);
      expect(unmatched).toHaveLength(0);
    });

    it('포함 관계로 부분 매칭해야 한다', () => {
      const candidatesWithSeason: SimilarContent[] = [
        {
          contentId: 3,
          tmdbId: 12345,
          contentType: 'tv',
          title: '오징어 게임: 시즌 2',
          posterUrl: '/squid2.jpg',
          genres: [],
          voteAverage: 8.0,
          description: '설명',
          similarity: 0.88,
          director: null,
          originCountry: 'KR',
          overview: null,
        },
      ];
      const titles = [{ korean: '오징어 게임', english: null }];
      const { matched, unmatched } = service.matchTitlesToCandidates(titles, candidatesWithSeason);

      expect(matched).toHaveLength(1);
      expect(matched[0].tmdbId).toBe(12345);
      expect(unmatched).toHaveLength(0);
    });

    it('매칭 실패 시 unmatched에 포함해야 한다', () => {
      const titles = [{ korean: '존재하지 않는 영화', english: null }];
      const { matched, unmatched } = service.matchTitlesToCandidates(titles, candidates);

      expect(matched).toHaveLength(0);
      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].korean).toBe('존재하지 않는 영화');
    });

    it('빈 titles이면 matched/unmatched 모두 빈 배열이어야 한다', () => {
      const { matched, unmatched } = service.matchTitlesToCandidates([], candidates);

      expect(matched).toEqual([]);
      expect(unmatched).toEqual([]);
    });

    it('빈 candidates이면 모두 unmatched가 되어야 한다', () => {
      const titles = [{ korean: '기생충', english: null }];
      const { matched, unmatched } = service.matchTitlesToCandidates(titles, []);

      expect(matched).toHaveLength(0);
      expect(unmatched).toHaveLength(1);
    });
  });

  describe('resolveReferenceEmbedding 통합', () => {
    const setupForReferenceTest = () => {
      const emptyQb = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
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
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(true);
      mockExtractUserPreference.mockReturnValue({
        preferredGenres: [], preferredCountries: [], ottProviderNames: [], hasData: false,
      });
      mockStreamCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: '추천합니다.' } }] };
        },
      });
    };

    it('referenceTitles가 있으면 DB에서 임베딩을 조회하고 searchWithFilters에 전달해야 한다', async () => {
      setupForReferenceTest();

      const fakeEmbedding = [0.1, 0.2, 0.3];
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ottProviderNames: [], countries: [], excludeCountries: [],
        personNames: [], referenceTitles: ['기생충'],
        dateRange: null, contentType: 'movie', genres: [],
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('');

      // DB에서 임베딩 찾음
      mockDataSource.query.mockResolvedValue([
        { content_id: 1, tmdb_id: 496243, embedding: JSON.stringify(fakeEmbedding) },
      ]);

      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(1, '기생충 같은 영화', [], jest.fn());

      // ILIKE 쿼리 호출 확인
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        ['기생충'],
      );

      // precomputedEmbedding이 searchWithFilters에 전달됨
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        expect.any(String), 20, expect.any(Array),
        expect.any(Object),
        fakeEmbedding,
      );
    });

    it('DB에서 못 찾으면 TMDB fallback으로 임베딩을 생성해야 한다', async () => {
      setupForReferenceTest();

      const fakeEmbedding = [0.4, 0.5, 0.6];
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ottProviderNames: [], countries: [], excludeCountries: [],
        personNames: [], referenceTitles: ['영야성하'],
        dateRange: null, contentType: 'tv', genres: [],
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('');

      // DB에서 못 찾음
      mockDataSource.query.mockResolvedValue([]);

      // TMDB 검색 성공
      mockContentsService.searchContents
        .mockResolvedValueOnce({ results: [] }) // movie 검색 실패
        .mockResolvedValueOnce({ results: [{ id: 12345 }] }); // tv 검색 성공

      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 100, tmdbId: 12345 });
      mockEmbeddingService.cacheContentMetadata.mockResolvedValue({
        embedding: JSON.stringify(fakeEmbedding),
      });

      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(1, '영야성하 같은 드라마', [], jest.fn());

      // TMDB 검색 호출 확인
      expect(mockContentsService.searchContents).toHaveBeenCalledWith('영야성하', 'movie', 1);
      expect(mockContentsService.searchContents).toHaveBeenCalledWith('영야성하', 'tv', 1);

      // findOrFetchByTmdbId + cacheContentMetadata 호출 확인
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(12345, 'tv');
      expect(mockEmbeddingService.cacheContentMetadata).toHaveBeenCalledWith(100);

      // precomputedEmbedding 전달 확인
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        expect.any(String), 20, expect.any(Array),
        expect.any(Object),
        fakeEmbedding,
      );
    });

    it('참조 작품의 tmdbId가 제외 목록에 포함되어야 한다', async () => {
      setupForReferenceTest();

      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ottProviderNames: [], countries: [], excludeCountries: [],
        personNames: [], referenceTitles: ['기생충'],
        dateRange: null, contentType: null, genres: [],
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('');

      mockDataSource.query.mockResolvedValue([
        { content_id: 1, tmdb_id: 496243, embedding: JSON.stringify([0.1]) },
      ]);

      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      await service.sendMessageStream(1, '기생충 같은 영화', [], jest.fn());

      // searchSimilar의 excludeTmdbIds에 496243이 포함되어야 함
      const excludeArg = mockEmbeddingService.searchSimilar.mock.calls[0][2] as number[];
      expect(excludeArg).toContain(496243);
    });
  });
});
