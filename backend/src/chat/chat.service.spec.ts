import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { EmbeddingService, SimilarContent } from './embedding.service';
import { ContentSearchService } from './content-search.service';
import { IntentAnalyzerService, ParsedIntent } from './intent-analyzer';
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
    const emptyIntent: ParsedIntent = {
      ottProviderNames: [],
      countries: [],
      personNames: [],
      dateRange: null,
      contentType: null,
      genres: [],
    };

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
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(true);
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({ ...emptyIntent });
      mockIntentAnalyzerService.buildSemanticQuery.mockImplementation((query: string) => query);
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
      );
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
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
});
