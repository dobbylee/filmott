import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Review } from '../reviews/review.entity';
import { Watchlist } from '../watchlist/watchlist.entity';
import { R2Module } from '../integrations/r2/r2.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, Review, Watchlist]),
    R2Module,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
