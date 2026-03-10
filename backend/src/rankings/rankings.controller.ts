import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { RankingsService } from './rankings.service';

@Controller('api/rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  /**
   * GET /api/rankings?source=kobis&category=daily-box-office&limit=10
   */
  @Get()
  async getRankings(
    @Query('source') source: string,
    @Query('category') category: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.rankingsService.getRankings(source, category, parsedLimit);
  }

  /**
   * POST /api/rankings/refresh/:category
   * 수동 갱신 (관리용)
   */
  @Post('refresh/:category')
  async refresh(@Param('category') category: string) {
    switch (category) {
      case 'daily-box-office':
        return this.rankingsService.fetchDailyBoxOffice();
      case 'trending-all-day':
        return this.rankingsService.fetchTrending('all', 'day');
      case 'trending-movie-day':
        return this.rankingsService.fetchTrending('movie', 'day');
      case 'trending-tv-day':
        return this.rankingsService.fetchTrending('tv', 'day');
      case 'trending-all-week':
        return this.rankingsService.fetchTrending('all', 'week');
      default:
        return { message: `Unknown category: ${category}` };
    }
  }
}
