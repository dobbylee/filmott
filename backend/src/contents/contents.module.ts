import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './content.entity';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { TmdbModule } from '../tmdb/tmdb.module';
import { EmbeddingModule } from '../chat/embedding.module';

@Module({
  imports: [TypeOrmModule.forFeature([Content]), TmdbModule, EmbeddingModule],
  controllers: [ContentsController],
  providers: [ContentsService],
  exports: [ContentsService],
})
export class ContentsModule {}
