import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RankingsService } from './rankings.service';
import { Ranking } from './ranking.entity';
import { KobisService } from '../kobis/kobis.service';
import { TmdbService } from '../tmdb/tmdb.service';
import { ContentsService } from '../contents/contents.service';

describe('RankingsService', () => {
  let service: RankingsService;

  const mockRankingRepo = {
    create: jest.fn(),
    save: jest.fn(),
    upsert: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockKobisService = {
    getDailyBoxOffice: jest.fn(),
    getWeeklyBoxOffice: jest.fn(),
  };

  const mockTmdbService = {
    searchByType: jest.fn(),
    getTrending: jest.fn(),
  };

  const mockContentsService = {
    findOrFetchByTmdbId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingsService,
        { provide: getRepositoryToken(Ranking), useValue: mockRankingRepo },
        { provide: KobisService, useValue: mockKobisService },
        { provide: TmdbService, useValue: mockTmdbService },
        { provide: ContentsService, useValue: mockContentsService },
      ],
    }).compile();

    service = module.get<RankingsService>(RankingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchDailyBoxOffice', () => {
    it('KOBIS 데이터를 가져오고 TMDB와 매칭하여 targetDate와 함께 랭킹을 upsert해야 한다', async () => {
      const kobisItems = [
        {
          rank: '1',
          movieNm: 'Test Movie',
          movieCd: '12345',
          openDt: '2026-03-01',
          audiCnt: '100000',
          audiAcc: '500000',
          salesAmt: '1000000',
          salesAcc: '5000000',
        },
      ];

      mockKobisService.getDailyBoxOffice.mockResolvedValue(kobisItems);

      const tmdbSearchResult = {
        results: [
          {
            id: 999,
            title: 'Test Movie',
            release_date: '2026-03-01',
            poster_path: '/poster.jpg',
          },
        ],
      };
      mockTmdbService.searchByType.mockResolvedValue(tmdbSearchResult);

      const cachedContent = {
        id: 42,
        tmdbId: 999,
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      };
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue(cachedContent);

      mockRankingRepo.create.mockImplementation((data: object) => ({ ...data }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchDailyBoxOffice();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        source: 'kobis',
        category: 'daily-box-office',
        rank: 1,
        contentId: 42,
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      });
      expect(result[0].targetDate).toBeDefined();
      expect(mockKobisService.getDailyBoxOffice).toHaveBeenCalled();
      expect(mockRankingRepo.upsert).toHaveBeenCalledWith(
        expect.any(Array),
        ['source', 'category', 'rank', 'targetDate'],
      );
    });

    it('TMDB 매칭 실패 시에도 랭킹을 저장해야 한다', async () => {
      const kobisItems = [
        {
          rank: '1',
          movieNm: 'Unknown Movie',
          movieCd: '99999',
          openDt: '2026-03-01',
          audiCnt: '10000',
          audiAcc: '50000',
          salesAmt: '100000',
          salesAcc: '500000',
        },
      ];

      mockKobisService.getDailyBoxOffice.mockResolvedValue(kobisItems);
      mockTmdbService.searchByType.mockResolvedValue({ results: [] });

      mockRankingRepo.create.mockImplementation((data: object) => ({ ...data }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchDailyBoxOffice();

      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBeUndefined();
      expect(result[0].targetDate).toBeDefined();
    });

    it('targetDate를 YYYY-MM-DD 형식의 어제 날짜로 설정해야 한다', async () => {
      const kobisItems = [
        {
          rank: '1',
          movieNm: 'Test Movie',
          movieCd: '12345',
          openDt: '2026-03-01',
          audiCnt: '100000',
          audiAcc: '500000',
          salesAmt: '1000000',
          salesAcc: '5000000',
        },
      ];

      mockKobisService.getDailyBoxOffice.mockResolvedValue(kobisItems);
      mockTmdbService.searchByType.mockResolvedValue({ results: [] });
      mockRankingRepo.create.mockImplementation((data: object) => ({ ...data }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchDailyBoxOffice();

      // targetDate should be YYYY-MM-DD format
      expect(result[0].targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('fetchTrending', () => {
    it('TMDB 트렌딩 데이터를 가져오고 targetDate와 함께 랭킹을 upsert해야 한다', async () => {
      const trendingData = {
        results: [
          {
            id: 100,
            media_type: 'movie',
            title: 'Trending Movie',
            poster_path: '/trending.jpg',
          },
          {
            id: 200,
            media_type: 'tv',
            name: 'Trending Show',
            poster_path: '/show.jpg',
          },
        ],
      };

      mockTmdbService.getTrending.mockResolvedValue(trendingData);

      const movieContent = { id: 10, tmdbId: 100 };
      const tvContent = { id: 20, tmdbId: 200 };
      mockContentsService.findOrFetchByTmdbId
        .mockResolvedValueOnce(movieContent)
        .mockResolvedValueOnce(tvContent);

      mockRankingRepo.create.mockImplementation((data: object) => ({ ...data }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchTrending('all', 'day');

      expect(result).toHaveLength(2);
      expect(result[0].targetDate).toBeDefined();
      expect(result[1].targetDate).toBeDefined();
      expect(mockTmdbService.getTrending).toHaveBeenCalledWith('all', 'day');
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledTimes(2);
      expect(mockRankingRepo.upsert).toHaveBeenCalledWith(
        expect.any(Array),
        ['source', 'category', 'rank', 'targetDate'],
      );
    });

    it('targetDate를 YYYY-MM-DD 형식의 오늘 날짜로 설정해야 한다', async () => {
      const trendingData = {
        results: [
          {
            id: 100,
            media_type: 'movie',
            title: 'Trending Movie',
            poster_path: '/trending.jpg',
          },
        ],
      };

      mockTmdbService.getTrending.mockResolvedValue(trendingData);
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 10 });
      mockRankingRepo.create.mockImplementation((data: object) => ({ ...data }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchTrending('movie', 'day');

      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result[0].targetDate).toBe(expectedDate);
    });

    it('콘텐츠 캐싱 실패 시에도 랭킹을 저장해야 한다', async () => {
      const trendingData = {
        results: [
          {
            id: 300,
            media_type: 'movie',
            title: 'Fail Movie',
            poster_path: '/fail.jpg',
          },
        ],
      };

      mockTmdbService.getTrending.mockResolvedValue(trendingData);
      mockContentsService.findOrFetchByTmdbId.mockRejectedValue(
        new Error('TMDB error'),
      );

      mockRankingRepo.create.mockImplementation((data: object) => ({ ...data }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchTrending('movie', 'day');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        source: 'tmdb',
        category: 'trending-movie-day',
        rank: 1,
        title: 'Fail Movie',
      });
      expect(result[0].targetDate).toBeDefined();
    });
  });

  describe('fetchDailyBoxOffice - 순차 TMDB 호출', () => {
    it('여러 항목을 순차적으로 TMDB 매칭해야 한다 (rate limit 방어)', async () => {
      const kobisItems = [
        {
          rank: '1',
          movieNm: 'Movie A',
          movieCd: '111',
          openDt: '2026-03-01',
          audiCnt: '100000',
          audiAcc: '500000',
          salesAmt: '1000000',
          salesAcc: '5000000',
        },
        {
          rank: '2',
          movieNm: 'Movie B',
          movieCd: '222',
          openDt: '2026-03-02',
          audiCnt: '80000',
          audiAcc: '400000',
          salesAmt: '800000',
          salesAcc: '4000000',
        },
      ];

      mockKobisService.getDailyBoxOffice.mockResolvedValue(kobisItems);

      const callOrder: string[] = [];
      mockTmdbService.searchByType.mockImplementation(async (name: string) => {
        callOrder.push(`search:${name}`);
        return {
          results: [
            { id: 100, title: name, release_date: '2026-03-01' },
          ],
        };
      });
      mockContentsService.findOrFetchByTmdbId.mockImplementation(async () => {
        callOrder.push('cache');
        return { id: 1, posterUrl: '/poster.jpg' };
      });

      mockRankingRepo.create.mockImplementation((data: object) => ({ ...data }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchDailyBoxOffice();

      // 순차 호출 확인: Movie A 검색+캐시 -> Movie B 검색+캐시
      expect(callOrder[0]).toBe('search:Movie A');
      expect(callOrder[1]).toBe('cache');
      expect(callOrder[2]).toBe('search:Movie B');
      expect(callOrder[3]).toBe('cache');
    });
  });

  describe('fetchDailyBoxOffice - 에러 처리', () => {
    it('KOBIS 서비스 실패 시 에러를 던져야 한다', async () => {
      const error = new Error('KOBIS API error');
      mockKobisService.getDailyBoxOffice.mockRejectedValue(error);

      await expect(service.fetchDailyBoxOffice()).rejects.toThrow('KOBIS API error');
    });
  });

  describe('fetchTrending - 에러 처리', () => {
    it('TMDB getTrending 실패 시 에러를 던져야 한다', async () => {
      const error = new Error('TMDB API error');
      mockTmdbService.getTrending.mockRejectedValue(error);

      await expect(service.fetchTrending('all', 'day')).rejects.toThrow('TMDB API error');
    });
  });

  describe('getRankings', () => {
    it('content가 조인된 최신 랭킹을 반환해야 한다', async () => {
      const fetchedAt = new Date('2026-03-09T10:00:00Z');
      mockRankingRepo.findOne.mockResolvedValue({ fetchedAt });

      const rankings = [
        {
          id: 1,
          source: 'kobis',
          category: 'daily-box-office',
          rank: 1,
          title: 'Movie 1',
          targetDate: '2026-03-08',
          content: { id: 1, title: 'Movie 1' },
          fetchedAt,
        },
        {
          id: 2,
          source: 'kobis',
          category: 'daily-box-office',
          rank: 2,
          title: 'Movie 2',
          targetDate: '2026-03-08',
          content: null,
          fetchedAt,
        },
      ];
      mockRankingRepo.find.mockResolvedValue(rankings);

      const result = await service.getRankings(
        'kobis',
        'daily-box-office',
        10,
      );

      expect(result).toHaveLength(2);
      expect(mockRankingRepo.findOne).toHaveBeenCalledWith({
        where: { source: 'kobis', category: 'daily-box-office' },
        order: { fetchedAt: 'DESC' },
        select: ['fetchedAt'],
      });
      expect(mockRankingRepo.find).toHaveBeenCalledWith({
        where: {
          source: 'kobis',
          category: 'daily-box-office',
          fetchedAt,
        },
        relations: ['content'],
        order: { rank: 'ASC' },
        take: 10,
      });
    });

    it('랭킹이 없을 때 빈 배열을 반환해야 한다', async () => {
      mockRankingRepo.findOne.mockResolvedValue(null);

      const result = await service.getRankings('kobis', 'daily-box-office');

      expect(result).toEqual([]);
    });
  });
});
