import {
  ClassSerializerInterceptor,
  type INestApplication,
  type ModuleMetadata,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import { createIntegrationTypeOrmOptions } from './database';

interface IntegrationAppOptions {
  imports?: NonNullable<ModuleMetadata['imports']>;
  controllers?: NonNullable<ModuleMetadata['controllers']>;
  providers?: NonNullable<ModuleMetadata['providers']>;
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createIntegrationApp(
  options: IntegrationAppOptions = {},
): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TypeOrmModule.forRoot(createIntegrationTypeOrmOptions()),
      ...(options.imports ?? []),
    ],
    controllers: options.controllers ?? [],
    providers: options.providers ?? [],
  });

  const configuredBuilder = options.configure
    ? options.configure(builder)
    : builder;
  const moduleFixture = await configuredBuilder.compile();
  const app = moduleFixture.createNestApplication();
  configureIntegrationApp(app);
  await app.init();
  return app;
}

export function configureIntegrationApp(app: INestApplication): void {
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
