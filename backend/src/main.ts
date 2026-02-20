import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global prefix for API
  app.setGlobalPrefix('api');

  // Enable CORS
  app.enableCors({
    origin: 'http://localhost:5173', // Frontend URL
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch(console.error);
