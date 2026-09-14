import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAIModule } from '../integrations/openai/openai.module';
import { ContentMetadata } from './entities/content-metadata.entity';
import { Content } from '../contents/content.entity';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContentMetadata, Content]), OpenAIModule],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
