import { Controller, Get, Post, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { GetRankingsDto } from './dto/get-rankings.dto';

@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  private static readonly VALID_SOURCES = ['kobis', 'tmdb'];
  private static readonly VALID_CATEGORIES = [
    'daily-box-office',
    'weekly-box-office',
    'trending-all-day',
    'trending-all-week',
  ];

  /**
   * GET /api/rankings?source=kobis&category=daily-box-office&limit=10
   */
  @Get()
  async getRankings(@Query() dto: GetRankingsDto) {
    if (!RankingsController.VALID_SOURCES.includes(dto.source)) {
      throw new BadRequestException(
        `Invalid source. Must be one of: ${RankingsController.VALID_SOURCES.join(', ')}`,
      );
    }
    if (!RankingsController.VALID_CATEGORIES.includes(dto.category)) {
      throw new BadRequestException(
        `Invalid category. Must be one of: ${RankingsController.VALID_CATEGORIES.join(', ')}`,
      );
    }

    const parsedLimit = dto.limit ? parseInt(dto.limit, 10) : 10;
    const limit = Math.min(Math.max(parsedLimit, 1), 100);
    return this.rankingsService.getRankings(dto.source, dto.category, limit);
  }

  /**
   * POST /api/rankings/refresh/:category
   * 수동 갱신 (관리용)
   */
  @Post('refresh/:category')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async refresh(@Param('category') category: string) {
    switch (category) {
      case 'daily-box-office':
        return this.rankingsService.fetchDailyBoxOffice();
      case 'weekly-box-office':
        return this.rankingsService.fetchWeeklyBoxOffice();
      case 'trending-all-day':
        return this.rankingsService.fetchTrending('all', 'day');
      case 'trending-all-week':
        return this.rankingsService.fetchTrending('all', 'week');
      default:
        throw new BadRequestException(`Unknown category: ${category}`);
    }
  }
}
