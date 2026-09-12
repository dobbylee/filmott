import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { RelatedContentService } from './related-content.service';

@Controller('contents')
export class RelatedContentsController {
  constructor(private readonly relatedContentService: RelatedContentService) {}

  @Get(':type/:tmdbId/related')
  async getRelated(
    @Param('type') type: string,
    @Param('tmdbId', ParseIntPipe) tmdbId: number,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
  ) {
    if (type !== 'movie' && type !== 'tv') {
      throw new BadRequestException('type은 "movie" 또는 "tv"만 허용됩니다.');
    }
    return this.relatedContentService.findRelatedContents(tmdbId, type, limit);
  }
}
