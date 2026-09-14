import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAIModule } from '../integrations/openai/openai.module';
import { Content } from '../contents/content.entity';
import { ContentMetadata } from './content-metadata.entity';
import { ContentMetadataService } from './content-metadata.service';
import { RecommendationSearchService } from './recommendation-search.service';
import { RelatedContentsController } from './related-contents.controller';
import { RelatedContentService } from './related-content.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContentMetadata, Content]), OpenAIModule],
  controllers: [RelatedContentsController],
  providers: [
    RelatedContentService,
    ContentMetadataService,
    RecommendationSearchService,
  ],
  exports: [ContentMetadataService, RecommendationSearchService],
})
export class RecommendationModule {}
