import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseIntPipe,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ContentsService } from './contents.service';
import { SearchContentsDto } from './dto/search-contents.dto';
import { DiscoverContentsDto } from './dto/discover-contents.dto';
import { ToggleAdultDto } from './dto/toggle-adult.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('contents')
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @Get('search')
  async search(@Query() dto: SearchContentsDto) {
    const page = dto.page ? parseInt(dto.page, 10) : 1;
    return this.contentsService.searchContents(dto.q, dto.type, page);
  }

  @Get('discover')
  async discover(@Query() dto: DiscoverContentsDto) {
    const type = dto.type ?? 'movie';
    const page = dto.page ? parseInt(dto.page, 10) : 1;
    const year = dto.year ? parseInt(dto.year, 10) : undefined;

    return this.contentsService.discoverContents(type, {
      genres: dto.genres,
      providers: dto.providers,
      year,
      sort: dto.sort,
      page,
    });
  }

  @Get('person/:personId')
  async getPersonDetail(@Param('personId', ParseIntPipe) personId: number) {
    return this.contentsService.getPersonDetail(personId);
  }

  @Get('person/:personId/credits')
  async getPersonCredits(@Param('personId', ParseIntPipe) personId: number) {
    return this.contentsService.getPersonCredits(personId);
  }

  @Get('sitemap')
  async getSitemapContents() {
    return this.contentsService.getSitemapContents();
  }

  @Patch('adult')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async toggleAdult(@Body() dto: ToggleAdultDto) {
    return this.contentsService.toggleAdult(
      dto.tmdbId,
      dto.contentType,
      dto.adult,
    );
  }

  @Get('adult-list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdultContents(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.max(1, Math.min(parseInt(limit ?? '20', 10) || 20, 100));
    return this.contentsService.getAdultContents(p, l);
  }

  @Post('adult/block-person/:personId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async blockPersonContents(@Param('personId', ParseIntPipe) personId: number) {
    return this.contentsService.blockPersonContents(personId);
  }

  @Get(':type/:tmdbId')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async getDetail(
    @Param('type') type: string,
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
  ) {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type은 "movie" 또는 "tv"만 허용됩니다.');
    }
    return this.contentsService.getContentDetail(tmdbId, type);
  }
}
