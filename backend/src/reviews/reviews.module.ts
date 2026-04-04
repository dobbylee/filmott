import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './review.entity';
import { ReviewLike } from './review-like.entity';
import { ReviewComment } from './review-comment.entity';
import { ReviewsService } from './reviews.service';
import { ReviewCommentsService } from './review-comments.service';
import { ReviewsController } from './reviews.controller';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Review, ReviewLike, ReviewComment]), WatchlistModule, CommonModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewCommentsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
