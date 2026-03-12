import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watchlist } from './watchlist.entity';
import { WatchlistService } from './watchlist.service';
import { WatchlistController } from './watchlist.controller';
import { ContentsModule } from '../contents/contents.module';

@Module({
  imports: [TypeOrmModule.forFeature([Watchlist]), ContentsModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService],
})
export class WatchlistModule {}
