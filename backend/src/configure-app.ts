import {
  ClassSerializerInterceptor,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);

  app.use(cookieParser());
  app.setGlobalPrefix('api');

  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:3000',
  );
  const origin = corsOrigin.includes(',')
    ? corsOrigin.split(',').map((value) => value.trim())
    : corsOrigin;
  app.enableCors({
    origin,
    credentials: true,
  });

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
