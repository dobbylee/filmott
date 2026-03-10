import { Test, TestingModule } from '@nestjs/testing';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';

describe('RankingsController', () => {
  let controller: RankingsController;
  let rankingsService: RankingsService;

  const mockRankingsService = {
    getRankings: jest.fn(),
    fetchDailyBoxOffice: jest.fn(),
    fetchTrending: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RankingsController],
      providers: [
        { provide: RankingsService, useValue: mockRankingsService },
      ],
    }).compile();

    controller = module.get<RankingsController>(RankingsController);
    rankingsService = module.get<RankingsService>(RankingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/rankings', () => {
    it('should return rankings with default limit', async () => {
      const mockRankings = [
        { id: 1, source: 'kobis', category: 'daily-box-office', rank: 1 },
      ];
      mockRankingsService.getRankings.mockResolvedValue(mockRankings);

      const result = await controller.getRankings(
        'kobis',
        'daily-box-office',
      );

      expect(result).toEqual(mockRankings);
      expect(mockRankingsService.getRankings).toHaveBeenCalledWith(
        'kobis',
        'daily-box-office',
        10,
      );
    });

    it('should pass custom limit', async () => {
      mockRankingsService.getRankings.mockResolvedValue([]);

      await controller.getRankings('tmdb', 'trending-all-day', '5');

      expect(mockRankingsService.getRankings).toHaveBeenCalledWith(
        'tmdb',
        'trending-all-day',
        5,
      );
    });
  });

  describe('POST /api/rankings/refresh/:category', () => {
    it('should call fetchDailyBoxOffice for daily-box-office', async () => {
      mockRankingsService.fetchDailyBoxOffice.mockResolvedValue([]);

      await controller.refresh('daily-box-office');

      expect(mockRankingsService.fetchDailyBoxOffice).toHaveBeenCalled();
    });

    it('should call fetchTrending for trending categories', async () => {
      mockRankingsService.fetchTrending.mockResolvedValue([]);

      await controller.refresh('trending-all-day');

      expect(mockRankingsService.fetchTrending).toHaveBeenCalledWith(
        'all',
        'day',
      );
    });

    it('should call fetchTrending with movie type', async () => {
      mockRankingsService.fetchTrending.mockResolvedValue([]);

      await controller.refresh('trending-movie-day');

      expect(mockRankingsService.fetchTrending).toHaveBeenCalledWith(
        'movie',
        'day',
      );
    });

    it('should call fetchTrending with tv type', async () => {
      mockRankingsService.fetchTrending.mockResolvedValue([]);

      await controller.refresh('trending-tv-day');

      expect(mockRankingsService.fetchTrending).toHaveBeenCalledWith(
        'tv',
        'day',
      );
    });

    it('should call fetchTrending with all type and week window', async () => {
      mockRankingsService.fetchTrending.mockResolvedValue([]);

      await controller.refresh('trending-all-week');

      expect(mockRankingsService.fetchTrending).toHaveBeenCalledWith(
        'all',
        'week',
      );
    });

    it('should return message for unknown category', async () => {
      const result = await controller.refresh('unknown');

      expect(result).toEqual({ message: 'Unknown category: unknown' });
    });
  });
});
