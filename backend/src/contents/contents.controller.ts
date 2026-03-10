import { Controller, Get, Param, Query, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { SearchContentsDto } from './dto/search-contents.dto';
import { DiscoverContentsDto } from './dto/discover-contents.dto';

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
      page,
    });
  }

  @Get(':type/:tmdbId')
  async getDetail(
    @Param('type') type: string,
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
  ) {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type must be "movie" or "tv"');
    }
    return this.contentsService.getContentDetail(tmdbId, type);
  }
}
