import { RankingsSchedulerService } from './services/rankings-scheduler.service';
import { RankingsManagementService } from './services/rankings-management.service';
import { RankingsQueryService } from './services/rankings-query.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ranking } from './ranking.entity';
import { RankingsSyncService } from './services/rankings-sync.service';
import { RankingsController } from './rankings.controller';
import { KobisModule } from '../integrations/kobis/kobis.module';
import { TmdbModule } from '../integrations/tmdb/tmdb.module';
import { ContentsModule } from '../contents/contents.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ranking]),
    KobisModule,
    TmdbModule,
    ContentsModule,
    RecommendationModule,
    CommonModule,
  ],
  controllers: [RankingsController],
  providers: [
    RankingsSchedulerService,
    RankingsSyncService,
    RankingsQueryService,
    RankingsManagementService,
  ],
})
export class RankingsModule {}
