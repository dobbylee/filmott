import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Ranking } from './ranking.entity';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';
import { KobisModule } from '../kobis/kobis.module';
import { TmdbModule } from '../tmdb/tmdb.module';
import { ContentsModule } from '../contents/contents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ranking]),
    ScheduleModule.forRoot(),
    KobisModule,
    TmdbModule,
    ContentsModule,
  ],
  controllers: [RankingsController],
  providers: [RankingsService],
  exports: [RankingsService],
})
export class RankingsModule {}
