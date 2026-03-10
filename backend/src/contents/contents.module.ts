import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './content.entity';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { TmdbModule } from '../tmdb/tmdb.module';

@Module({
  imports: [TypeOrmModule.forFeature([Content]), TmdbModule],
  controllers: [ContentsController],
  providers: [ContentsService],
  exports: [ContentsService],
})
export class ContentsModule {}
