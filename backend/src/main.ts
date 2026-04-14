import './instrument';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Retrieve ConfigService from the application context
  const configService = app.get(ConfigService);

  // Cookie parser (OAuth2 state 검증용)
  app.use(cookieParser());

  // Set global prefix for API
  app.setGlobalPrefix('api');

  // Enable CORS (콤마 구분 다중 origin 지원: "https://filmott.kr,https://www.filmott.kr")
  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:3000',
  );
  const origin = corsOrigin.includes(',')
    ? corsOrigin.split(',').map((s) => s.trim())
    : corsOrigin;
  app.enableCors({
    origin,
    credentials: true,
  });

  // Enable class-transformer serialization (e.g. @Exclude on password)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Enable Data Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips away properties that do not have any decorators
      forbidNonWhitelisted: true, // Throw an error instead of just stripping non-whitelisted properties
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
    }),
  );

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
