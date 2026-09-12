import { Module } from '@nestjs/common';
import { RelatedContentsController } from './related-contents.controller';
import { RelatedContentService } from './related-content.service';

@Module({
  controllers: [RelatedContentsController],
  providers: [RelatedContentService],
})
export class RecommendationModule {}
