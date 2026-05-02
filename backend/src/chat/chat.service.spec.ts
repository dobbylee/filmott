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
import {
  RECOMMENDATIONS_TRAILER_CLOSE,
  RECOMMENDATIONS_TRAILER_OPEN,
} from './structured-chat-response';

// extractUserPreference mock
const mockExtractUserPreference = jest.fn<UserPreference, []>();
jest.mock('./user-preference', () => ({
  extractUserPreference: (...args: unknown[]) =>
    mockExtractUserPreference(...(args as [])),
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

  async function* createChatStream(chunks: string[]) {
    for (const content of chunks) {
      yield {
        choices: [
          {
            delta: { content },
          },
        ],
      };
    }
  }

  const mockStreamingResponse = (chunks: string[]) => {
    mockStreamCreate.mockResolvedValue(createChatStream(chunks));
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
    mockStreamingResponse([
      '추천해 드릴게요.\n\n다른 분위기나 장르도 말해주세요.',
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
        {
          title: '기생충',
          releaseDate: '2019-05-30',
          genres: '드라마, 스릴러',
          rating: 10,
          originCountry: 'KR',
        },
      ]);

      const dislikedQb = mockQueryBuilder();
      dislikedQb.getRawMany.mockResolvedValue([
        {
          title: '영화X',
          releaseDate: '2020-01-01',
          genres: '액션',
          rating: 2,
          originCountry: 'US',
        },
      ]);

      const genreStatsQb = mockQueryBuilder();
      genreStatsQb.getRawMany.mockResolvedValue([
        { genre: '드라마', avgRating: '8.5', count: '5' },
      ]);

      const watchedTmdbIdsQb = mockQueryBuilder();
      watchedTmdbIdsQb.getRawMany.mockResolvedValue([{ tmdbId: 496243 }]);

      const wantToWatchQb = mockQueryBuilder();
      wantToWatchQb.getRawMany.mockResolvedValue([
        {
          title: '인셉션',
          releaseDate: '2010-07-16',
          genres: 'SF, 액션',
          originCountry: 'US',
        },
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
      confidence: 'low',
    };

    const defaultEmptyPreference: UserPreference = {
      preferredGenres: [],
      preferredCountries: [],
      ottProviderNames: [],
      hasData: false,
      excludeGenres: [],
      excludePersonNames: [],
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
      mockUserRepo.findOne.mockResolvedValue({
        id: 1,
        subscribedOtts: ['netflix'],
      });
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(true);
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockImplementation(
        (query: string) => query,
      );
      mockExtractUserPreference.mockReturnValue({ ...defaultEmptyPreference });
    };

    it('스트리밍 추천 ID가 후보와 매칭되면 text/recommendations/done 이벤트를 순서대로 emit해야 한다', async () => {
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

      mockStreamingResponse([
        '좋은 영화를 추천해 드릴게요!\n\n',
        '**기생충 (Parasite)** — 봉준호 감독의 걸작입니다.',
        `\n\n${RECOMMENDATIONS_TRAILER_OPEN}\n`,
        '[{"tmdbId":496243,"contentType":"movie"}]',
        `\n${RECOMMENDATIONS_TRAILER_CLOSE}`,
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '추천해줘', [], emit);

      // text 이벤트 확인
      const textEvents = emittedEvents.filter((e) => e.event === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      expect(
        textEvents.map((e) => (e.data as { content: string }).content).join(''),
      ).toContain('**기생충** - 봉준호 감독의 걸작입니다.');
      expect(
        textEvents.map((e) => (e.data as { content: string }).content).join(''),
      ).not.toContain(RECOMMENDATIONS_TRAILER_OPEN);

      // recommendations 이벤트 확인 (후보 매칭 성공 시)
      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(1);
      const recs = (
        recEvents[0].data as { recommendations: { tmdbId: number }[] }
      ).recommendations;
      expect(recs[0].tmdbId).toBe(496243);

      // done 이벤트 확인
      const doneEvents = emittedEvents.filter((e) => e.event === 'done');
      expect(doneEvents).toHaveLength(1);
    });

    it('추천 trailer에 추천작이 없으면 recommendations 이벤트를 emit하지 않아야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);
      mockStreamingResponse([
        '네, 어떤 장르를 좋아하시나요?\n\n원하는 분위기를 알려주시면 더 정확히 추천해 드릴게요.',
        `\n\n${RECOMMENDATIONS_TRAILER_OPEN}\n[]\n${RECOMMENDATIONS_TRAILER_CLOSE}`,
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '안녕', [], emit);

      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(0);

      const doneEvents = emittedEvents.filter((e) => e.event === 'done');
      expect(doneEvents).toHaveLength(1);
    });

    it('스트리밍 본문의 깨진 추천 줄 불릿을 정규화해서 emit해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);
      mockContentsService.searchContents.mockResolvedValue({ results: [] });
      mockStreamingResponse([
        '**- 다멜리오 쇼 - 가족/일상 기반의 리얼리티라 몰입하기 좋아요.',
        `\n\n${RECOMMENDATIONS_TRAILER_OPEN}\n[]\n${RECOMMENDATIONS_TRAILER_CLOSE}`,
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '리얼리티 예능 추천해줘', [], emit);

      const text = emittedEvents
        .filter((e) => e.event === 'text')
        .map((e) => (e.data as { content: string }).content)
        .join('');
      expect(text).toContain(
        '**다멜리오 쇼** - 가족/일상 기반의 리얼리티라 몰입하기 좋아요.',
      );
      expect(text).not.toContain('**- 다멜리오 쇼');
    });

    it('trailer가 없어도 본문 제목이 후보와 매칭되면 추천 카드를 emit해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([
        {
          contentId: 1,
          tmdbId: 156400,
          contentType: 'tv',
          title: '피의 게임',
          posterUrl: '/blood-game.jpg',
          genres: [{ id: 10764, name: '리얼리티' }],
          voteAverage: 8.1,
          description: '두뇌 서바이벌 예능',
          similarity: 0.8,
          director: null,
          originCountry: 'KR',
          overview: null,
        },
      ]);
      mockStreamingResponse([
        '피의 게임\n말 한마디, 타이밍, 연합과 배신이 핵심입니다.',
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(
        1,
        '두뇌 서바이벌 예능 추천해줘',
        [],
        emit,
      );

      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(1);
      expect(
        (recEvents[0].data as { recommendations: { title: string }[] })
          .recommendations[0].title,
      ).toBe('피의 게임');
      expect(mockContentsService.searchContents).not.toHaveBeenCalled();
    });

    it('trailer와 후보 매칭이 없어도 본문 제목을 TMDB 검색으로 카드 복구해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(true);
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        contentType: 'tv',
        genres: ['리얼리티', '토크'],
        confidence: 'high',
      });
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);
      mockContentsService.searchContents.mockResolvedValue({
        results: [
          {
            id: 156400,
            name: '피의 게임',
            poster_path: '/blood-game.jpg',
          },
        ],
      });
      mockStreamingResponse([
        '피의 게임\n말 한마디, 타이밍, 연합과 배신이 핵심입니다.',
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '멘탈/전략형으로 추천해줘', [], emit);

      expect(mockContentsService.searchContents).toHaveBeenCalledWith(
        '피의 게임',
        'tv',
        1,
      );
      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(1);
      expect(recEvents[0].data).toEqual({
        recommendations: [
          {
            tmdbId: 156400,
            contentType: 'tv',
            title: '피의 게임',
            posterUrl: '/blood-game.jpg',
          },
        ],
      });
    });

    it('trailer 매칭이 하나라도 있으면 본문 제목 fallback을 실행하지 않아야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([
        {
          contentId: 1,
          tmdbId: 156400,
          contentType: 'tv',
          title: '피의 게임',
          posterUrl: '/blood-game.jpg',
          genres: [{ id: 10764, name: '리얼리티' }],
          voteAverage: 8.1,
          description: '두뇌 서바이벌 예능',
          similarity: 0.8,
          director: null,
          originCountry: 'KR',
          overview: null,
        },
      ]);
      mockStreamingResponse([
        `피의 게임\n추천 이유입니다.\n\n다른 작품\n추천 이유입니다.\n\n${RECOMMENDATIONS_TRAILER_OPEN}\n`,
        '[{"tmdbId":156400,"contentType":"tv"}]',
        `\n${RECOMMENDATIONS_TRAILER_CLOSE}`,
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '두뇌 예능 추천해줘', [], emit);

      expect(mockContentsService.searchContents).not.toHaveBeenCalled();
      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(1);
    });

    it('tv 의도에서는 trailer에 movie 후보가 들어와도 추천 카드로 emit하지 않아야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        contentType: 'tv',
        genres: ['리얼리티'],
        confidence: 'high',
      });
      mockContentSearchService.searchWithFilters.mockResolvedValue([
        {
          contentId: 1,
          tmdbId: 801,
          contentType: 'movie',
          title: '더 콜',
          posterUrl: '/the-call.jpg',
          genres: [{ id: 53, name: '스릴러' }],
          voteAverage: 7.0,
          description: '영화',
          similarity: 0.5,
          director: null,
          originCountry: 'US',
          overview: null,
        },
      ]);
      mockStreamingResponse([
        `더 콜 - 제한된 단서 안에서 다음 선택을 계산해야 해요.\n\n${RECOMMENDATIONS_TRAILER_OPEN}\n`,
        '[{"tmdbId":801,"contentType":"movie"}]',
        `\n${RECOMMENDATIONS_TRAILER_CLOSE}`,
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '멘탈/전략형으로 추천해줘', [], emit);

      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(0);
    });

    it('본문 제목 fallback은 TMDB 검색 결과 제목이 정확히 맞을 때만 카드로 복구해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(true);
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        contentType: 'tv',
        genres: ['리얼리티'],
        confidence: 'high',
      });
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);
      mockContentsService.searchContents.mockResolvedValue({
        results: [
          {
            id: 999,
            name: '피의 게임 외전',
            poster_path: '/wrong.jpg',
          },
        ],
      });
      mockStreamingResponse([
        '피의 게임\n말 한마디, 타이밍, 연합과 배신이 핵심입니다.',
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '멘탈/전략형으로 추천해줘', [], emit);

      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(0);
    });

    it('추천 trailer 태그가 chunk 경계에 걸려도 텍스트로 노출하지 않아야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);
      mockStreamingResponse([
        '추천 본문입니다.\n\n',
        '<filmott',
        '_recommendations>\n[]\n',
        RECOMMENDATIONS_TRAILER_CLOSE,
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '추천해줘', [], emit);

      const text = emittedEvents
        .filter((e) => e.event === 'text')
        .map((e) => (e.data as { content: string }).content)
        .join('');
      expect(text).toBe('추천 본문입니다.\n\n');
      expect(text).not.toContain('filmott_recommendations');
    });

    it('굵은 글씨 키워드가 텍스트에 있어도 추천 trailer에 없으면 카드로 만들지 않아야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([
        {
          contentId: 1,
          tmdbId: 123,
          contentType: 'movie',
          title: '청춘',
          posterUrl: '/youth.jpg',
          genres: [{ id: 18, name: '드라마' }],
          voteAverage: 7.5,
          description: '청춘 영화',
          similarity: 0.8,
          director: null,
          originCountry: 'KR',
          overview: null,
        },
      ]);
      mockStreamingResponse([
        '**청춘** 키워드 중심으로 골라봤어요.\n\n원하는 분위기를 더 알려주세요.',
        `\n\n${RECOMMENDATIONS_TRAILER_OPEN}\n[]\n${RECOMMENDATIONS_TRAILER_CLOSE}`,
      ]);

      const emittedEvents: { event: string; data: unknown }[] = [];
      const emit = (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      };

      await service.sendMessageStream(1, '청춘 영화 추천해줘', [], emit);

      const textEvents = emittedEvents.filter((e) => e.event === 'text');
      expect(
        textEvents.map((e) => (e.data as { content: string }).content).join(''),
      ).toContain('**청춘**');
      const recEvents = emittedEvents.filter(
        (e) => e.event === 'recommendations',
      );
      expect(recEvents).toHaveLength(0);
    });

    it('이전 추천작은 history의 recommendations 메타데이터를 우선 사용해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '다른 작품 추천해줘',
        [
          {
            role: 'assistant',
            content: '**청춘** 키워드로 골라봤어요.',
            recommendations: [
              {
                tmdbId: 496243,
                contentType: 'movie',
                title: '기생충',
              },
            ],
          },
        ],
        jest.fn(),
      );

      const createParams = mockStreamCreate.mock.calls[0][0];
      const systemMessage = createParams.messages[0];
      expect(systemMessage.content).toContain('이미 추천한 작품: 기생충');
      expect(systemMessage.content).not.toContain('이미 추천한 작품: 청춘');
    });

    it('content_metadata가 비어있으면 임베딩 검색을 스킵해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.hasAnyMetadata.mockResolvedValue(false);

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
          {
            provide: IntentAnalyzerService,
            useValue: mockIntentAnalyzerService,
          },
          { provide: ContentsService, useValue: mockContentsService },
          {
            provide: getRepositoryToken(Watchlist),
            useValue: mockWatchlistRepo,
          },
          { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
          { provide: getRepositoryToken(User), useValue: mockUserRepo },
          { provide: getRepositoryToken(Content), useValue: mockContentRepo },
          { provide: DataSource, useValue: mockDataSource },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('') },
          },
        ],
      }).compile();

      const noKeyService = module.get<ChatService>(ChatService);

      await expect(
        noKeyService.sendMessageStream(1, '안녕', [], jest.fn()),
      ).rejects.toThrow(BadRequestException);
    });

    it('OpenAI 스트리밍 응답 호출에 30초 timeout 옵션이 전달되어야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      await service.sendMessageStream(1, '추천해줘', [], jest.fn());

      const createParams = mockStreamCreate.mock.calls[0][0];
      expect(createParams).toEqual(
        expect.objectContaining({
          stream: true,
        }),
      );
      expect(createParams).not.toHaveProperty('response_format');
      expect(mockStreamCreate.mock.calls[0][1]).toEqual(
        expect.objectContaining({ timeout: 30_000, signal: undefined }),
      );
    });

    it('대화 이력(history)을 포함하여 OpenAI에 전달해야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

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
            expect.objectContaining({
              role: 'assistant',
              content: '이전 답변',
            }),
            expect.objectContaining({ role: 'user', content: '새 질문' }),
          ]),
        }),
        expect.objectContaining({ timeout: 30_000 }),
      );
    });

    it('OTT 키워드가 있는 메시지는 ContentSearchService.searchWithFilters를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        ottProviderNames: ['Netflix'],
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '볼만한 영화',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '넷플릭스에서 볼만한 영화',
        [],
        jest.fn(),
      );

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

    it('confidence=low + 신규 유저 메시지는 EmbeddingService.searchSimilar를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        confidence: 'low',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '재미있는 영화',
      );
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '재미있는 영화 추천해줘',
        [],
        jest.fn(),
      );

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
        confidence: 'high',
      };
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue(intentResult);
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('감독 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '봉준호 감독의 최신 한국 영화',
        [],
        jest.fn(),
      );

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
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '사회 풍자 영화',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

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

      await service.sendMessageStream(1, '추천해줘', [], jest.fn());

      expect(mockIntentAnalyzerService.analyzeIntent).not.toHaveBeenCalled();
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('dateRange.to만 있는 의도면 ContentSearchService.searchWithFilters를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        dateRange: { from: null, to: '1999-12-31' },
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '90년대 이전 영화',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

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
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '무서운 영화',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '호러 스릴러 영화 추천해줘',
        [],
        jest.fn(),
      );

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

    it('confidence=low + 유저 데이터 있음: 유저 선호만으로 ContentSearchService.searchWithFilters를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        ...defaultEmptyPreference,
        ...defaultEmptyPreference,
        preferredGenres: ['드라마', '스릴러'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        confidence: 'low',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '잔잔한 영화',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '비 오는 날에 볼 만한 잔잔한 영화',
        [],
        jest.fn(),
      );

      // confidence=low이므로 intent 필터를 스킵하고 유저 선호만 전달
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        expect.any(String),
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

    it('필터 있음: 명시적 필터가 유저 선호보다 우선해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        ...defaultEmptyPreference,
        preferredGenres: ['드라마'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        ottProviderNames: ['Disney Plus'],
        countries: ['US'],
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '히어로 영화',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '디즈니플러스 미국 히어로 영화',
        [],
        jest.fn(),
      );

      const calledFilters =
        mockContentSearchService.searchWithFilters.mock.calls[0][3];
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
        ...defaultEmptyPreference,
        preferredGenres: ['드라마', '로맨스'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        ottProviderNames: ['Tving'],
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '로맨스 영화',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(1, '티빙에서 볼만한 영화', [], jest.fn());

      const calledFilters =
        mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // 명시적 OTT(Tving)가 유저 구독 OTT(Netflix)를 덮어야 한다
      expect(calledFilters.ottProviderNames).toEqual(['Tving']);
      // 명시적 필터가 없는 장르/국가는 유저 선호가 WHERE 필터로 합쳐져야 한다
      expect(calledFilters.genres).toEqual(['드라마', '로맨스']);
      expect(calledFilters.countries).toEqual(['KR']);
    });

    it('confidence=low + 유저 OTT 구독만 있고 장르/국가 선호 없는 경우 OTT 필터만 적용해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        ...defaultEmptyPreference,
        preferredGenres: [],
        preferredCountries: [],
        ottProviderNames: ['wavve'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        confidence: 'low',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('추천 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '오늘 볼 영화 추천해줘',
        [],
        jest.fn(),
      );

      const calledFilters =
        mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // confidence=low이므로 유저 선호만 적용
      expect(calledFilters.ottProviderNames).toEqual(['wavve']);
      expect(calledFilters.genres).toBeUndefined();
      expect(calledFilters.countries).toBeUndefined();
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('confidence=high이면 의도 필터 우선으로 ContentSearchService를 호출해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        ...defaultEmptyPreference,
        preferredGenres: ['로맨스'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        genres: ['액션', 'SF'],
        countries: ['US'],
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue(
        '미국 액션 SF',
      );
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(
        1,
        '미국 액션 SF 영화 추천해줘',
        [],
        jest.fn(),
      );

      const calledFilters =
        mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // confidence=high: 의도 필터가 우선, 유저 선호는 빈 필드에만 합산
      expect(calledFilters.genres).toEqual(['액션', 'SF']);
      expect(calledFilters.countries).toEqual(['US']);
      // OTT는 의도에 없으므로 유저 선호 합산
      expect(calledFilters.ottProviderNames).toEqual(['Netflix']);
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('confidence=low이면 의도 필터를 스킵하고 유저 선호만으로 검색해야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        ...defaultEmptyPreference,
        preferredGenres: ['드라마'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
      });
      // LLM이 장르를 추출했지만 confidence=low인 경우
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        genres: ['액션'],
        confidence: 'low',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('뭐 볼까');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(1, '뭐 볼까', [], jest.fn());

      const calledFilters =
        mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // confidence=low: 의도 필터(genres: ['액션'])를 스킵, 유저 선호만 사용
      expect(calledFilters.genres).toEqual(['드라마']);
      expect(calledFilters.countries).toEqual(['KR']);
      expect(calledFilters.ottProviderNames).toEqual(['Netflix']);
      expect(mockEmbeddingService.searchSimilar).not.toHaveBeenCalled();
    });

    it('extractUserPreference가 올바른 인자로 호출되어야 한다', async () => {
      setupEmptyUserContext();
      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      await service.sendMessageStream(1, '추천해줘', [], jest.fn());

      expect(mockExtractUserPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          favorites: expect.any(Array),
          genreStats: expect.any(Array),
          watchedTmdbIds: expect.any(Array),
        }),
        ['netflix'],
        expect.any(Array),
      );
    });

    it('excludeGenres가 searchWithFilters 호출 시 필터에 포함되어야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        ...defaultEmptyPreference,
        preferredGenres: ['드라마'],
        preferredCountries: ['KR'],
        ottProviderNames: ['Netflix'],
        hasData: true,
        excludeGenres: ['공포', '스릴러'],
        excludePersonNames: [],
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('영화 추천');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(1, '영화 추천해줘', [], jest.fn());

      const calledFilters =
        mockContentSearchService.searchWithFilters.mock.calls[0][3];
      expect(calledFilters.excludeGenres).toEqual(['공포', '스릴러']);
    });

    it('명시적 요청 장르와 겹치는 excludeGenres는 필터에서 제외되어야 한다', async () => {
      setupEmptyUserContext();
      mockExtractUserPreference.mockReturnValue({
        ...defaultEmptyPreference,
        preferredGenres: ['드라마'],
        preferredCountries: [],
        ottProviderNames: [],
        hasData: true,
        excludeGenres: ['공포', '스릴러'],
        excludePersonNames: [],
      });
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ...emptyIntent,
        genres: ['공포'],
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('공포 영화');
      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(1, '공포 영화 추천해줘', [], jest.fn());

      const calledFilters =
        mockContentSearchService.searchWithFilters.mock.calls[0][3];
      // '공포'는 명시적 요청 장르이므로 excludeGenres에서 제거
      expect(calledFilters.genres).toEqual(['공포']);
      expect(calledFilters.excludeGenres).toEqual(['스릴러']);
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
        preferredGenres: [],
        preferredCountries: [],
        ottProviderNames: [],
        hasData: false,
        excludeGenres: [],
        excludePersonNames: [],
      });
    };

    it('referenceTitles가 있으면 DB에서 임베딩을 조회하고 searchWithFilters에 전달해야 한다', async () => {
      setupForReferenceTest();

      const fakeEmbedding = [0.1, 0.2, 0.3];
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ottProviderNames: [],
        countries: [],
        excludeCountries: [],
        personNames: [],
        referenceTitles: ['기생충'],
        dateRange: null,
        contentType: 'movie',
        genres: [],
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('');

      // DB에서 임베딩 찾음
      mockDataSource.query.mockResolvedValue([
        {
          content_id: 1,
          tmdb_id: 496243,
          embedding: JSON.stringify(fakeEmbedding),
        },
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
        expect.any(String),
        20,
        expect.any(Array),
        expect.any(Object),
        fakeEmbedding,
      );
    });

    it('DB에서 못 찾으면 TMDB fallback으로 임베딩을 생성해야 한다', async () => {
      setupForReferenceTest();

      const fakeEmbedding = [0.4, 0.5, 0.6];
      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ottProviderNames: [],
        countries: [],
        excludeCountries: [],
        personNames: [],
        referenceTitles: ['영야성하'],
        dateRange: null,
        contentType: 'tv',
        genres: [],
        confidence: 'high',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('');

      // DB에서 못 찾음
      mockDataSource.query.mockResolvedValue([]);

      // TMDB 검색 성공
      mockContentsService.searchContents
        .mockResolvedValueOnce({ results: [] }) // movie 검색 실패
        .mockResolvedValueOnce({ results: [{ id: 12345 }] }); // tv 검색 성공

      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({
        id: 100,
        tmdbId: 12345,
      });
      mockEmbeddingService.cacheContentMetadata.mockResolvedValue({
        embedding: JSON.stringify(fakeEmbedding),
      });

      mockContentSearchService.searchWithFilters.mockResolvedValue([]);

      await service.sendMessageStream(1, '영야성하 같은 드라마', [], jest.fn());

      // TMDB 검색 호출 확인
      expect(mockContentsService.searchContents).toHaveBeenCalledWith(
        '영야성하',
        'movie',
        1,
      );
      expect(mockContentsService.searchContents).toHaveBeenCalledWith(
        '영야성하',
        'tv',
        1,
      );

      // findOrFetchByTmdbId + cacheContentMetadata 호출 확인
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(
        12345,
        'tv',
      );
      expect(mockEmbeddingService.cacheContentMetadata).toHaveBeenCalledWith(
        100,
      );

      // precomputedEmbedding 전달 확인
      expect(mockContentSearchService.searchWithFilters).toHaveBeenCalledWith(
        expect.any(String),
        20,
        expect.any(Array),
        expect.any(Object),
        fakeEmbedding,
      );
    });

    it('참조 작품의 tmdbId가 제외 목록에 포함되어야 한다', async () => {
      setupForReferenceTest();

      mockIntentAnalyzerService.analyzeIntent.mockResolvedValue({
        ottProviderNames: [],
        countries: [],
        excludeCountries: [],
        personNames: [],
        referenceTitles: ['기생충'],
        dateRange: null,
        contentType: null,
        genres: [],
        confidence: 'low',
      });
      mockIntentAnalyzerService.buildSemanticQuery.mockReturnValue('');

      mockDataSource.query.mockResolvedValue([
        { content_id: 1, tmdb_id: 496243, embedding: JSON.stringify([0.1]) },
      ]);

      mockEmbeddingService.searchSimilar.mockResolvedValue([]);

      await service.sendMessageStream(1, '기생충 같은 영화', [], jest.fn());

      // searchSimilar의 excludeTmdbIds에 496243이 포함되어야 함
      const excludeArg = mockEmbeddingService.searchSimilar.mock
        .calls[0][2] as number[];
      expect(excludeArg).toContain(496243);
    });
  });
});
