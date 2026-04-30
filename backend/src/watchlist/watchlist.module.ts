import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watchlist } from './watchlist.entity';
import { Review } from '../reviews/review.entity';
import { WatchlistService } from './watchlist.service';
import { WatchlistController } from './watchlist.controller';
import { ContentsModule } from '../contents/contents.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Watchlist, Review]),
    ContentsModule,
    CommonModule,
  ],
  controllers: [WatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService],
})
export class WatchlistModule {}
