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
    it('should fetch KOBIS data, match with TMDB, and save rankings', async () => {
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

      const savedRanking = {
        id: 1,
        source: 'kobis',
        category: 'daily-box-office',
        rank: 1,
        title: 'Test Movie',
        contentId: 42,
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      };
      mockRankingRepo.create.mockReturnValue(savedRanking);
      mockRankingRepo.save.mockResolvedValue(savedRanking);

      const result = await service.fetchDailyBoxOffice();

      expect(result).toHaveLength(1);
      expect(mockKobisService.getDailyBoxOffice).toHaveBeenCalled();
      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'Test Movie',
        'movie',
        1,
      );
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(
        999,
        'movie',
      );
    });

    it('should save ranking even when TMDB matching fails', async () => {
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

      const savedRanking = {
        id: 2,
        source: 'kobis',
        category: 'daily-box-office',
        rank: 1,
        title: 'Unknown Movie',
        contentId: undefined,
      };
      mockRankingRepo.create.mockReturnValue(savedRanking);
      mockRankingRepo.save.mockResolvedValue(savedRanking);

      const result = await service.fetchDailyBoxOffice();

      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBeUndefined();
    });
  });

  describe('fetchTrending', () => {
    it('should fetch TMDB trending data and save rankings', async () => {
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

      mockRankingRepo.create.mockImplementation((data: object) => data);
      mockRankingRepo.save.mockImplementation((data: object) => Promise.resolve({ id: Math.random(), ...data }));

      const result = await service.fetchTrending('all', 'day');

      expect(result).toHaveLength(2);
      expect(mockTmdbService.getTrending).toHaveBeenCalledWith('all', 'day');
      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledTimes(2);
    });

    it('should save ranking even when content caching fails', async () => {
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

      mockRankingRepo.create.mockImplementation((data: object) => data);
      mockRankingRepo.save.mockImplementation((data: object) => Promise.resolve({ id: 1, ...data }));

      const result = await service.fetchTrending('movie', 'day');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        source: 'tmdb',
        category: 'trending-movie-day',
        rank: 1,
        title: 'Fail Movie',
      });
    });
  });

  describe('getRankings', () => {
    it('should return latest rankings with content joined', async () => {
      const fetchedAt = new Date('2026-03-09T10:00:00Z');
      mockRankingRepo.findOne.mockResolvedValue({ fetchedAt });

      const rankings = [
        {
          id: 1,
          source: 'kobis',
          category: 'daily-box-office',
          rank: 1,
          title: 'Movie 1',
          content: { id: 1, title: 'Movie 1' },
          fetchedAt,
        },
        {
          id: 2,
          source: 'kobis',
          category: 'daily-box-office',
          rank: 2,
          title: 'Movie 2',
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

    it('should return empty array when no rankings exist', async () => {
      mockRankingRepo.findOne.mockResolvedValue(null);

      const result = await service.getRankings('kobis', 'daily-box-office');

      expect(result).toEqual([]);
    });
  });
});
