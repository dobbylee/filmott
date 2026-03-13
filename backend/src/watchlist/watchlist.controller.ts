import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { AddToWatchlistDto } from './dto/add-to-watchlist.dto';
import { UpdateWatchlistDto } from './dto/update-watchlist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Controller('watchlist')
@UseGuards(JwtAuthGuard)
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Post()
  async addToWatchlist(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddToWatchlistDto,
  ) {
    return this.watchlistService.addToWatchlist(user.id, dto);
  }

  @Patch(':id')
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWatchlistDto,
  ) {
    return this.watchlistService.updateStatus(user.id, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.watchlistService.removeFromWatchlist(user.id, id);
    return { message: 'Removed from watchlist' };
  }

  @Get('me')
  async getMyWatchlist(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    const s = status === 'watched' ? 'watched' : 'want_to_watch';
    const p = page ? parseInt(page, 10) : 1;
    return this.watchlistService.getMyWatchlist(user.id, s, p);
  }

  @Get('me/want-to-watch')
  async getWantToWatchAll(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 30;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    return this.watchlistService.getWantToWatchAll(
      user.id,
      isNaN(limit) ? 30 : limit,
      isNaN(offset) ? 0 : offset,
    );
  }

  @Get('me/watched-years')
  async getWatchedYears(@CurrentUser() user: JwtPayload) {
    return this.watchlistService.getWatchedYears(user.id);
  }

  @Get('me/watched')
  async getWatchedByYear(
    @CurrentUser() user: JwtPayload,
    @Query('year') yearStr?: string,
  ) {
    const currentYear = new Date().getFullYear();
    let year = currentYear;
    if (yearStr) {
      const parsed = parseInt(yearStr, 10);
      if (!isNaN(parsed) && parsed >= 1900 && parsed <= 2100) {
        year = parsed;
      }
    }
    return this.watchlistService.getWatchedByYear(user.id, year);
  }

  @Get('me/counts')
  async getMyWatchlistCounts(@CurrentUser() user: JwtPayload) {
    return this.watchlistService.getMyWatchlistCounts(user.id);
  }

  @Get('me/status')
  async getWatchlistStatus(
    @CurrentUser() user: JwtPayload,
    @Query('tmdbId') tmdbIdStr?: string,
    @Query('contentType') contentType?: string,
    @Query('contentId') contentIdStr?: string,
  ) {
    if (contentIdStr) {
      const contentId = parseInt(contentIdStr, 10);
      if (isNaN(contentId)) return { status: null, watchlistId: null };
      return this.watchlistService.getWatchlistStatus(user.id, contentId);
    }
    if (tmdbIdStr) {
      const tmdbId = parseInt(tmdbIdStr, 10);
      if (isNaN(tmdbId)) return { status: null, watchlistId: null };
      const ct = contentType === 'tv' ? 'tv' : 'movie';
      return this.watchlistService.getWatchlistStatusByTmdbId(user.id, tmdbId, ct);
    }
    return { status: null, watchlistId: null };
  }
}
