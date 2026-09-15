import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TmdbService } from './tmdb.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: 'https://api.themoviedb.org/3',
        headers: {
          Authorization: `Bearer ${configService.get<string>('TMDB_API_KEY')}`,
          Accept: 'application/json',
        },
        timeout: 10000,
      }),
    }),
  ],
  providers: [TmdbService],
  exports: [TmdbService],
})
export class TmdbModule {}
