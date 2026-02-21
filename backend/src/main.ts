import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global prefix for API
  app.setGlobalPrefix('api');

  // Enable CORS
  app.enableCors({
    origin: 'http://localhost:5173', // Frontend URL
    credentials: true,
  });

  // Enable Data Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips away properties that do not have any decorators
      forbidNonWhitelisted: true, // Throw an error instead of just stripping non-whitelisted properties
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch(console.error);
