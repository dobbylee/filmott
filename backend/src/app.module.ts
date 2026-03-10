import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ContentsModule } from './contents/contents.module';
import { User } from './users/user.entity';
import { Content } from './contents/content.entity';
import { Ranking } from './rankings/ranking.entity';
import { Review } from './reviews/review.entity';
import { ReviewLike } from './reviews/review-like.entity';
import { ReviewComment } from './reviews/review-comment.entity';

@Module({
  imports: [
    // Load .env file globally
    ConfigModule.forRoot({ isGlobal: true }),

    // PostgreSQL connection via TypeORM using ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [User, Content, Ranking, Review, ReviewLike, ReviewComment],
        synchronize: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        extra: {
          options: '-c timezone=Asia/Seoul',
        },
      }),
    }),

    UsersModule,
    AuthModule,
    ContentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
