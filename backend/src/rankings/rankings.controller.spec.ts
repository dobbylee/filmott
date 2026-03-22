import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('RankingsController', () => {
  let controller: RankingsController;
  let reflector: Reflector;

  const mockRankingsService = {
    getRankings: jest.fn(),
    fetchDailyBoxOffice: jest.fn(),
    fetchWeeklyBoxOffice: jest.fn(),
    fetchTrending: jest.fn(),
    updatePosterUrl: jest.fn(),
    getUnmatchedRankings: jest.fn(),
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
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/rankings', () => {
    it('기본 limit으로 랭킹을 반환해야 한다', async () => {
      mockRankingsService.getRankings.mockResolvedValue([]);

      await controller.getRankings({
        source: 'kobis',
        category: 'daily-box-office',
      });

      expect(mockRankingsService.getRankings).toHaveBeenCalledWith(
        'kobis',
        'daily-box-office',
        10,
      );
    });

    it('사용자 지정 limit을 전달해야 한다', async () => {
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
    it('daily-box-office에 대해 fetchDailyBoxOffice를 호출해야 한다', async () => {
      mockRankingsService.fetchDailyBoxOffice.mockResolvedValue([]);

      await controller.refresh('daily-box-office');

      expect(mockRankingsService.fetchDailyBoxOffice).toHaveBeenCalled();
    });

    it('트렌딩 카테고리에 대해 fetchTrending을 호출해야 한다', async () => {
      mockRankingsService.fetchTrending.mockResolvedValue([]);

      await controller.refresh('trending-all-day');

      expect(mockRankingsService.fetchTrending).toHaveBeenCalledWith(
        'all',
        'day',
      );
    });

    it('제거된 trending-movie-day 카테고리에 대해 BadRequestException을 던져야 한다', async () => {
      await expect(controller.refresh('trending-movie-day')).rejects.toThrow(BadRequestException);
    });

    it('제거된 trending-tv-day 카테고리에 대해 BadRequestException을 던져야 한다', async () => {
      await expect(controller.refresh('trending-tv-day')).rejects.toThrow(BadRequestException);
    });

    it('all 타입과 week 윈도우로 fetchTrending을 호출해야 한다', async () => {
      mockRankingsService.fetchTrending.mockResolvedValue([]);

      await controller.refresh('trending-all-week');

      expect(mockRankingsService.fetchTrending).toHaveBeenCalledWith(
        'all',
        'week',
      );
    });

    it('알 수 없는 카테고리에 대해 BadRequestException을 던져야 한다', async () => {
      await expect(controller.refresh('unknown')).rejects.toThrow(BadRequestException);
    });
  });

  describe('가드 적용 확인', () => {
    it('refresh 메서드에 JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', RankingsController.prototype.refresh);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(2);
      expect(guards[0]).toBe(JwtAuthGuard);
      expect(guards[1]).toBe(RolesGuard);
    });

    it('refresh 메서드에 ADMIN 역할이 필요해야 한다', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, RankingsController.prototype.refresh);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('getRankings 메서드에는 가드가 없어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', RankingsController.prototype.getRankings);
      expect(guards).toBeUndefined();
    });

    it('getUnmatched 메서드에 JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', RankingsController.prototype.getUnmatched);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(2);
      expect(guards[0]).toBe(JwtAuthGuard);
      expect(guards[1]).toBe(RolesGuard);
    });

    it('getUnmatched 메서드에 ADMIN 역할이 필요해야 한다', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, RankingsController.prototype.getUnmatched);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.ADMIN);
    });

    it('updatePosterUrl 메서드에 JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', RankingsController.prototype.updatePosterUrl);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(2);
      expect(guards[0]).toBe(JwtAuthGuard);
      expect(guards[1]).toBe(RolesGuard);
    });

    it('updatePosterUrl 메서드에 ADMIN 역할이 필요해야 한다', () => {
      const roles = reflector.get<UserRole[]>(ROLES_KEY, RankingsController.prototype.updatePosterUrl);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.ADMIN);
    });
  });
});
