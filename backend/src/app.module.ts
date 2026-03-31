import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ContentsModule } from './contents/contents.module';
import { RankingsModule } from './rankings/rankings.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    SentryModule.forRoot(),

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
        autoLoadEntities: true,
        synchronize: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: true,
        extra: {
          options: '-c timezone=Asia/Seoul',
          // pg-pool 설정
          max: 50,                       // 최대 커넥션 수 (기본 10 -> 50)
          min: 5,                        // 최소 유휴 커넥션
          idleTimeoutMillis: 30000,      // 유휴 커넥션 30초 후 해제
          connectionTimeoutMillis: 5000, // 커넥션 획득 대기 최대 5초
        },
      }),
    }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),

    UsersModule,
    AuthModule,
    ContentsModule,
    RankingsModule,
    ReviewsModule,
    WatchlistModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    AppService,
  ],
})
export class AppModule {}
