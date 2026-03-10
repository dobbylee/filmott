import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KobisService } from './kobis.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL:
          'http://www.kobis.or.kr/kobisopenapi/webservice/rest',
        params: {
          key: configService.get<string>('KOBIS_API_KEY'),
        },
        timeout: 15000,
      }),
    }),
  ],
  providers: [KobisService],
  exports: [KobisService],
})
export class KobisModule {}
