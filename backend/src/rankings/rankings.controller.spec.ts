import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('RankingsController', () => {
  let controller: RankingsController;
  let rankingsService: RankingsService;
  let reflector: Reflector;

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
        Reflector,
      ],
    }).compile();

    controller = module.get<RankingsController>(RankingsController);
    rankingsService = module.get<RankingsService>(RankingsService);
    reflector = module.get<Reflector>(Reflector);
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

      const result = await controller.getRankings({
        source: 'kobis',
        category: 'daily-box-office',
      });

      expect(result).toEqual(mockRankings);
      expect(mockRankingsService.getRankings).toHaveBeenCalledWith(
        'kobis',
        'daily-box-office',
        10,
      );
    });

    it('should pass custom limit', async () => {
      mockRankingsService.getRankings.mockResolvedValue([]);

      await controller.getRankings({ source: 'tmdb', category: 'trending-all-day', limit: '5' });

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

    it('should return unknown message for removed trending-movie-day category', async () => {
      const result = await controller.refresh('trending-movie-day');

      expect(result).toEqual({ message: 'Unknown category: trending-movie-day' });
    });

    it('should return unknown message for removed trending-tv-day category', async () => {
      const result = await controller.refresh('trending-tv-day');

      expect(result).toEqual({ message: 'Unknown category: trending-tv-day' });
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

  describe('refresh endpoint guards', () => {
    it('should have JwtAuthGuard and RolesGuard applied to refresh method', () => {
      const guards = Reflect.getMetadata('__guards__', RankingsController.prototype.refresh);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(2);
      expect(guards[0]).toBe(JwtAuthGuard);
      expect(guards[1]).toBe(RolesGuard);
    });

    it('should have ADMIN role required for refresh method', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, RankingsController.prototype.refresh);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('should NOT have guards on getRankings method', () => {
      const guards = Reflect.getMetadata('__guards__', RankingsController.prototype.getRankings);
      expect(guards).toBeUndefined();
    });
  });
});
