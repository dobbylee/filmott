import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './content.entity';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { TmdbModule } from '../tmdb/tmdb.module';
import { CommonModule } from '../common/common.module';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content]),
    TmdbModule,
    CommonModule,
    EmbeddingModule,
  ],
  controllers: [ContentsController],
  providers: [ContentsService],
  exports: [ContentsService],
})
export class ContentsModule {}
