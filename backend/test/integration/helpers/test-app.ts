import {
  ClassSerializerInterceptor,
  type INestApplication,
  type ModuleMetadata,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import { EventEmitter } from 'events';
import { createRequest, createResponse } from 'node-mocks-http';
import type { Request, Response } from 'express';
import { createIntegrationTypeOrmOptions } from './database';

interface IntegrationAppOptions {
  imports?: NonNullable<ModuleMetadata['imports']>;
  controllers?: NonNullable<ModuleMetadata['controllers']>;
  providers?: NonNullable<ModuleMetadata['providers']>;
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export interface IntegrationHttpResponse {
  status: number;
  body: unknown;
}

export type IntegrationHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function createIntegrationApp(
  options: IntegrationAppOptions = {},
): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TypeOrmModule.forRoot(createIntegrationTypeOrmOptions()),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
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

export async function requestIntegrationApp(
  app: INestApplication,
  method: IntegrationHttpMethod,
  path: string,
  body?: Record<string, unknown>,
): Promise<IntegrationHttpResponse> {
  const expressApp = app.getHttpAdapter().getInstance() as {
    handle: (
      req: Request,
      res: Response,
      next: (error?: unknown) => void,
    ) => void;
  };
  const req = createRequest<Request>({
    method,
    url: path,
    originalUrl: path,
    body,
    headers:
      body === undefined ? undefined : { 'content-type': 'application/json' },
  });
  const res = createResponse<Response>({ eventEmitter: EventEmitter });

  return new Promise((resolve, reject) => {
    const resolveResponse = () => {
      resolve({
        status: res._getStatusCode(),
        body: res._isJSON() ? res._getJSONData() : res._getData(),
      });
    };

    res.once('end', resolveResponse);
    expressApp.handle(req, res, (error?: unknown) => {
      if (error) {
        reject(
          error instanceof Error
            ? error
            : new Error(
                typeof error === 'string' ? error : 'HTTP adapter error',
              ),
        );
      } else if (!res.headersSent) {
        resolveResponse();
      }
    });
  });
}
