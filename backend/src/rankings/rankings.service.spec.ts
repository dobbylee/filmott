import * as Sentry from '@sentry/nestjs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import { RankingsService } from './rankings.service';
import { Ranking } from './ranking.entity';
import { KobisService } from '../kobis/kobis.service';
import { TmdbService } from '../tmdb/tmdb.service';
import { ContentsService } from '../contents/contents.service';
import { EmbeddingService } from '../chat/embedding.service';
import { RevalidateService } from '../common/revalidate.service';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

describe('RankingsService', () => {
  let service: RankingsService;

  const mockRankingRepo = {
    create: jest.fn(),
    save: jest.fn(),
    upsert: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    count: jest.fn(),
  };

  const mockKobisService = {
    getDailyBoxOffice: jest.fn(),
    getWeeklyBoxOffice: jest.fn(),
  };

  const mockTmdbService = {
    searchByType: jest.fn(),
    getTrending: jest.fn(),
    discoverByFilters: jest.fn(),
  };

  const mockContentsService = {
    findOrFetchByTmdbId: jest.fn(),
  };

  const mockEmbeddingService = {
    batchCacheByContentIds: jest
      .fn()
      .mockResolvedValue({ cached: 0, skipped: 0, failed: 0 }),
  };

  const mockRevalidateService = {
    revalidatePath: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingsService,
        { provide: getRepositoryToken(Ranking), useValue: mockRankingRepo },
        { provide: KobisService, useValue: mockKobisService },
        { provide: TmdbService, useValue: mockTmdbService },
        { provide: ContentsService, useValue: mockContentsService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: RevalidateService, useValue: mockRevalidateService },
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

      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
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
      expect(mockRankingRepo.upsert).toHaveBeenCalledWith(expect.any(Array), [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith('/', [
        'rankings',
      ]);
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

      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
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
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchDailyBoxOffice();

      // targetDate should be YYYY-MM-DD format
      expect(result[0].targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('daily box office schedulers', () => {
    it('자정 스케줄러가 fetchDailyBoxOffice를 호출해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(service, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.scheduleDailyBoxOfficeMidnight();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('정오 스케줄러가 fetchDailyBoxOffice를 호출해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(service, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.scheduleDailyBoxOfficeNoon();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('백필 스케줄러는 전일 데이터가 없을 때만 fetchDailyBoxOffice를 호출해야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(0);
      const fetchSpy = jest
        .spyOn(service, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.backfillDailyBoxOfficeIfMissing();

      expect(mockRankingRepo.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          source: 'kobis',
          category: 'daily-box-office',
          targetDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('백필 스케줄러는 전일 데이터가 이미 있으면 호출하지 않아야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(10);
      const fetchSpy = jest
        .spyOn(service, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.backfillDailyBoxOfficeIfMissing();

      expect(fetchSpy).not.toHaveBeenCalled();
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

      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchTrending('all', 'day');

      expect(result).toHaveLength(2);
      expect(result[0].targetDate).toBeDefined();
      expect(result[1].targetDate).toBeDefined();
      expect(mockTmdbService.getTrending).toHaveBeenCalledWith('all', 'day');
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledTimes(2);
      expect(mockRankingRepo.upsert).toHaveBeenCalledWith(expect.any(Array), [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);
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
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.fetchTrending('movie', 'day');

      const expectedDate = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Seoul',
      });
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

      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
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
          results: [{ id: 100, title: name, release_date: '2026-03-01' }],
        };
      });
      mockContentsService.findOrFetchByTmdbId.mockImplementation(async () => {
        callOrder.push('cache');
        return { id: 1, posterUrl: '/poster.jpg' };
      });

      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
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

      await expect(service.fetchDailyBoxOffice()).rejects.toThrow(
        'KOBIS API error',
      );
    });

    it('KOBIS 서비스 실패 시 Sentry.captureException을 호출해야 한다', async () => {
      const error = new Error('KOBIS API error');
      mockKobisService.getDailyBoxOffice.mockRejectedValue(error);

      await expect(service.fetchDailyBoxOffice()).rejects.toThrow();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'KOBIS',
          message: 'KOBIS API error',
        }),
      );
    });

    it('KOBIS Axios 실패를 Sentry에 보낼 때 민감정보를 제외해야 한다', async () => {
      const error = new AxiosError(
        'Request failed with status code 403',
        'ERR_BAD_REQUEST',
        {
          headers: new AxiosHeaders({
            Authorization: 'Bearer kobis-auth-token',
          }),
          url: '/boxoffice/searchDailyBoxOfficeList.json?key=kobis-query-key',
          params: { key: 'kobis-param-key', targetDt: '20260429' },
        },
      );
      mockKobisService.getDailyBoxOffice.mockRejectedValue(error);

      await expect(service.fetchDailyBoxOffice()).rejects.toThrow();

      const payload = JSON.stringify(
        (Sentry.captureException as jest.Mock).mock.calls,
      );
      expect(payload).not.toContain('kobis-auth-token');
      expect(payload).not.toContain('kobis-query-key');
      expect(payload).not.toContain('kobis-param-key');
      expect(payload).not.toContain('Authorization');
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'KOBIS',
          endpointPath: '/boxoffice/searchDailyBoxOfficeList.json',
        }),
      );
    });
  });

  describe('fetchTrending - 에러 처리', () => {
    it('TMDB getTrending 실패 시 에러를 던져야 한다', async () => {
      const error = new Error('TMDB API error');
      mockTmdbService.getTrending.mockRejectedValue(error);

      await expect(service.fetchTrending('all', 'day')).rejects.toThrow(
        'TMDB API error',
      );
    });
  });

  describe('fetchWeeklyBoxOffice - 에러 처리', () => {
    it('KOBIS 서비스 실패 시 Sentry.captureException을 호출해야 한다', async () => {
      const error = new Error('KOBIS Weekly API error');
      mockKobisService.getWeeklyBoxOffice.mockRejectedValue(error);

      await expect(service.fetchWeeklyBoxOffice()).rejects.toThrow();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'KOBIS',
          message: 'KOBIS Weekly API error',
        }),
      );
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

      const result = await service.getRankings('kobis', 'daily-box-office', 10);

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

  describe('updatePosterUrl', () => {
    it('존재하는 랭킹의 posterUrl을 업데이트해야 한다', async () => {
      const ranking = { id: 1, title: 'Test Movie', posterUrl: undefined };
      mockRankingRepo.findOneBy.mockResolvedValue(ranking);
      mockRankingRepo.save.mockResolvedValue({
        ...ranking,
        posterUrl: 'https://example.com/poster.jpg',
      });

      const result = await service.updatePosterUrl(
        1,
        'https://example.com/poster.jpg',
      );

      expect(mockRankingRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(mockRankingRepo.save).toHaveBeenCalledWith({
        ...ranking,
        posterUrl: 'https://example.com/poster.jpg',
      });
      expect(result.posterUrl).toBe('https://example.com/poster.jpg');
    });

    it('존재하지 않는 랭킹에 대해 NotFoundException을 던져야 한다', async () => {
      mockRankingRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updatePosterUrl(999, 'https://example.com/poster.jpg'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUnmatchedRankings', () => {
    it('contentId가 NULL인 최신 targetDate의 랭킹을 반환해야 한다', async () => {
      const latestRecord = { targetDate: '2026-03-16' };
      mockRankingRepo.findOne.mockResolvedValue(latestRecord);

      const unmatchedRankings = [
        {
          id: 1,
          rank: 3,
          title: 'Unmatched Movie',
          targetDate: '2026-03-16',
          contentId: null,
        },
      ];
      mockRankingRepo.find.mockResolvedValue(unmatchedRankings);

      const result = await service.getUnmatchedRankings();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Unmatched Movie');
      expect(mockRankingRepo.findOne).toHaveBeenCalled();
      expect(mockRankingRepo.find).toHaveBeenCalled();
    });

    it('매칭 실패 항목이 없을 때 빈 배열을 반환해야 한다', async () => {
      mockRankingRepo.findOne.mockResolvedValue(null);

      const result = await service.getUnmatchedRankings();

      expect(result).toEqual([]);
    });
  });

  describe('fetchAllTrending - revalidation 중복 제거', () => {
    it('fetchAllTrending은 모든 trending 처리 후 revalidatePath를 1회만 호출해야 한다', async () => {
      const trendingData = {
        results: [
          {
            id: 100,
            media_type: 'movie',
            title: 'Movie',
            poster_path: '/m.jpg',
          },
        ],
      };

      mockTmdbService.getTrending.mockResolvedValue(trendingData);
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 10 });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchAllTrending();

      // fetchAllTrending은 fetchTrending을 2회 호출하지만, revalidate는 1회만
      expect(mockTmdbService.getTrending).toHaveBeenCalledTimes(2);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith('/', [
        'rankings',
      ]);
    });

    it('fetchTrending 단독 호출 시 revalidatePath를 호출하지 않아야 한다', async () => {
      const trendingData = {
        results: [
          {
            id: 100,
            media_type: 'movie',
            title: 'Movie',
            poster_path: '/m.jpg',
          },
        ],
      };

      mockTmdbService.getTrending.mockResolvedValue(trendingData);
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 10 });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchTrending('all', 'day');

      expect(mockRevalidateService.revalidatePath).not.toHaveBeenCalled();
    });

    it('refreshTrending은 트렌딩 저장 후 rankings 태그를 revalidate해야 한다', async () => {
      const trendingData = {
        results: [
          {
            id: 100,
            media_type: 'movie',
            title: 'Movie',
            poster_path: '/m.jpg',
          },
        ],
      };

      mockTmdbService.getTrending.mockResolvedValue(trendingData);
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 10 });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      const result = await service.refreshTrending('all', 'day');

      expect(result).toHaveLength(1);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith('/', [
        'rankings',
      ]);
    });

    it('일부 카테고리 fetchTrending이 실패해도 revalidatePath를 1회 호출해야 한다', async () => {
      mockTmdbService.getTrending
        .mockResolvedValueOnce({
          results: [
            {
              id: 100,
              media_type: 'movie',
              title: 'Movie',
              poster_path: '/m.jpg',
            },
          ],
        })
        .mockRejectedValueOnce(new Error('TMDB 일시 장애'));

      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 10 });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchAllTrending();

      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith('/', [
        'rankings',
      ]);
    });

    it('일부 카테고리 fetchTrending이 실패하면 Sentry.captureException을 호출해야 한다', async () => {
      const trendingError = new Error('TMDB 일시 장애');
      mockTmdbService.getTrending
        .mockResolvedValueOnce({
          results: [
            {
              id: 100,
              media_type: 'movie',
              title: 'Movie',
              poster_path: '/m.jpg',
            },
          ],
        })
        .mockRejectedValueOnce(trendingError);

      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 10 });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchAllTrending();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'TMDB',
          message: 'TMDB 일시 장애',
        }),
      );
    });
  });

  describe('metadata 배치 캐싱 연결', () => {
    it('fetchDailyBoxOffice 완료 후 contentId가 있는 항목의 metadata 캐싱을 호출해야 한다', async () => {
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
      mockTmdbService.searchByType.mockResolvedValue({
        results: [{ id: 999, title: 'Test Movie', release_date: '2026-03-01' }],
      });
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({
        id: 42,
        posterUrl: '/poster.jpg',
      });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchDailyBoxOffice();

      expect(mockEmbeddingService.batchCacheByContentIds).toHaveBeenCalledWith([
        42,
      ]);
    });

    it('fetchDailyBoxOffice에서 contentId가 없으면 metadata 캐싱을 호출하지 않아야 한다', async () => {
      const kobisItems = [
        {
          rank: '1',
          movieNm: 'Unknown',
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
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchDailyBoxOffice();

      expect(
        mockEmbeddingService.batchCacheByContentIds,
      ).not.toHaveBeenCalled();
    });

    it('fetchTrending 완료 후 한국 구독형 OTT 제공자가 있는 항목만 metadata 캐싱을 호출해야 한다', async () => {
      const trendingData = {
        results: [
          {
            id: 100,
            media_type: 'movie',
            title: 'Movie',
            poster_path: '/m.jpg',
          },
          { id: 200, media_type: 'tv', name: 'Show', poster_path: '/s.jpg' },
          {
            id: 300,
            media_type: 'movie',
            title: 'Rental Movie',
            poster_path: '/r.jpg',
          },
        ],
      };

      mockTmdbService.getTrending.mockResolvedValue(trendingData);
      mockContentsService.findOrFetchByTmdbId
        .mockResolvedValueOnce({
          id: 10,
          watchProviders: {
            flatrate: [
              {
                provider_id: 8,
                provider_name: 'Netflix',
                logo_path: '/netflix.jpg',
              },
            ],
          },
        })
        .mockResolvedValueOnce({ id: 20, watchProviders: null })
        .mockResolvedValueOnce({
          id: 30,
          watchProviders: {
            rent: [
              {
                provider_id: 2,
                provider_name: 'Apple TV',
                logo_path: '/apple.jpg',
              },
            ],
          },
        });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchTrending('all', 'day');

      expect(mockEmbeddingService.batchCacheByContentIds).toHaveBeenCalledWith([
        10,
      ]);
      expect(mockRankingRepo.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ contentId: 10 }),
          expect.objectContaining({ contentId: 20 }),
          expect.objectContaining({ contentId: 30 }),
        ]),
        ['source', 'category', 'rank', 'targetDate'],
      );
    });

    it('fetchWeeklyBoxOffice 완료 후 contentId가 있는 항목의 metadata 캐싱을 호출해야 한다', async () => {
      const kobisItems = [
        {
          rank: '1',
          movieNm: 'Weekly Movie',
          movieCd: '67890',
          openDt: '2026-03-01',
          audiCnt: '200000',
          audiAcc: '1000000',
          salesAmt: '2000000',
          salesAcc: '10000000',
        },
      ];

      mockKobisService.getWeeklyBoxOffice.mockResolvedValue(kobisItems);
      mockTmdbService.searchByType.mockResolvedValue({
        results: [
          { id: 888, title: 'Weekly Movie', release_date: '2026-03-01' },
        ],
      });
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({
        id: 55,
        posterUrl: '/poster.jpg',
      });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await service.fetchWeeklyBoxOffice();

      expect(mockEmbeddingService.batchCacheByContentIds).toHaveBeenCalledWith([
        55,
      ]);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith('/', [
        'rankings',
      ]);
    });
  });

  describe('fetchKoreanTvDiscover', () => {
    it('Discover API를 2페이지 호출하고 contents를 캐싱해야 한다', async () => {
      const page1 = {
        results: [
          { id: 1001, name: 'Korean Drama 1' },
          { id: 1002, name: 'Korean Drama 2' },
        ],
      };
      const page2 = {
        results: [{ id: 1003, name: 'Korean Drama 3' }],
      };

      mockTmdbService.discoverByFilters
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      mockContentsService.findOrFetchByTmdbId
        .mockResolvedValueOnce({ id: 101 })
        .mockResolvedValueOnce({ id: 102 })
        .mockResolvedValueOnce({ id: 103 });

      await service.fetchKoreanTvDiscover();

      expect(mockTmdbService.discoverByFilters).toHaveBeenCalledTimes(2);
      expect(mockTmdbService.discoverByFilters).toHaveBeenCalledWith(
        'tv',
        expect.objectContaining({
          originCountry: 'KR',
          sort: 'first_air_date.desc',
          page: 1,
        }),
      );
      expect(mockTmdbService.discoverByFilters).toHaveBeenCalledWith(
        'tv',
        expect.objectContaining({
          page: 2,
        }),
      );

      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledTimes(3);
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(
        1001,
        'tv',
      );
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(
        1002,
        'tv',
      );
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(
        1003,
        'tv',
      );
    });

    it('캐싱 성공한 contentId로 metadata 캐싱을 호출해야 한다', async () => {
      mockTmdbService.discoverByFilters
        .mockResolvedValueOnce({ results: [{ id: 2001 }] })
        .mockResolvedValueOnce({ results: [] });

      mockContentsService.findOrFetchByTmdbId.mockResolvedValue({ id: 201 });

      await service.fetchKoreanTvDiscover();

      expect(mockEmbeddingService.batchCacheByContentIds).toHaveBeenCalledWith([
        201,
      ]);
    });

    it('contents 캐싱 실패 시에도 에러를 throw하지 않아야 한다', async () => {
      mockTmdbService.discoverByFilters
        .mockResolvedValueOnce({
          results: [{ id: 3001 }, { id: 3002 }],
        })
        .mockResolvedValueOnce({ results: [] });

      mockContentsService.findOrFetchByTmdbId
        .mockRejectedValueOnce(new Error('TMDB error'))
        .mockResolvedValueOnce({ id: 301 });

      await expect(service.fetchKoreanTvDiscover()).resolves.not.toThrow();

      expect(mockEmbeddingService.batchCacheByContentIds).toHaveBeenCalledWith([
        301,
      ]);
    });

    it('Discover API 실패 시 에러 로깅만 하고 throw하지 않아야 한다', async () => {
      mockTmdbService.discoverByFilters.mockRejectedValue(
        new Error('TMDB Discover error'),
      );

      await expect(service.fetchKoreanTvDiscover()).resolves.not.toThrow();

      expect(
        mockEmbeddingService.batchCacheByContentIds,
      ).not.toHaveBeenCalled();
    });

    it('Discover API 실패 시 Sentry.captureException을 호출해야 한다', async () => {
      const error = new Error('TMDB Discover error');
      mockTmdbService.discoverByFilters.mockRejectedValue(error);

      await service.fetchKoreanTvDiscover();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'TMDB',
          message: 'TMDB Discover error',
        }),
      );
    });

    it('수집 결과가 0건이면 metadata 캐싱을 호출하지 않아야 한다', async () => {
      mockTmdbService.discoverByFilters
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await service.fetchKoreanTvDiscover();

      expect(mockContentsService.findOrFetchByTmdbId).not.toHaveBeenCalled();
      expect(
        mockEmbeddingService.batchCacheByContentIds,
      ).not.toHaveBeenCalled();
    });
  });
});
