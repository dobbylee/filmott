import { Module } from '@nestjs/common';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [RecommendationModule],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
