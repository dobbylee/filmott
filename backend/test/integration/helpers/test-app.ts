import { type INestApplication, type ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitter } from 'events';
import { createRequest, createResponse } from 'node-mocks-http';
import type { Request, Response } from 'express';
import { AppModule } from '../../../src/app.module';
import { ChatService } from '../../../src/chat/chat.service';
import { EmbeddingService } from '../../../src/chat/embedding.service';
import { R2StorageService } from '../../../src/common/r2-storage.service';
import { configureApp } from '../../../src/configure-app';
import { KobisService } from '../../../src/kobis/kobis.service';
import { TmdbService } from '../../../src/tmdb/tmdb.service';
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
  })
    .overrideProvider(R2StorageService)
    .useValue(r2StorageServiceStub);

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
  configureApp(app);
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

const tmdbServiceStub = {
  getDetails: jest.fn().mockResolvedValue(null),
  searchByType: jest.fn().mockResolvedValue({ results: [] }),
  discoverByFilters: jest.fn().mockResolvedValue({ results: [] }),
  getPersonDetail: jest.fn().mockResolvedValue(null),
  getPersonCredits: jest.fn().mockResolvedValue({ cast: [], crew: [] }),
  getTrending: jest.fn().mockResolvedValue({ results: [] }),
};

const kobisServiceStub = {
  getDailyBoxOffice: jest.fn().mockResolvedValue([]),
  getWeeklyBoxOffice: jest.fn().mockResolvedValue([]),
};

const r2StorageServiceStub = {
  getPublicUrl: jest.fn().mockReturnValue('https://e2e.invalid'),
  upload: jest.fn().mockResolvedValue('https://e2e.invalid/image'),
  delete: jest.fn().mockResolvedValue(undefined),
};

const embeddingServiceStub = {
  hasAnyMetadata: jest.fn().mockResolvedValue(false),
  generateEmbedding: jest.fn(),
  cacheContentMetadata: jest.fn(),
  searchSimilar: jest.fn(),
  batchCacheByContentIds: jest
    .fn()
    .mockResolvedValue({ cached: 0, skipped: 0, failed: 0 }),
};

const chatServiceStub = {
  sendMessageStream: jest.fn(),
};

export async function createE2eTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(TmdbService)
    .useValue(tmdbServiceStub)
    .overrideProvider(KobisService)
    .useValue(kobisServiceStub)
    .overrideProvider(R2StorageService)
    .useValue(r2StorageServiceStub)
    .overrideProvider(EmbeddingService)
    .useValue(embeddingServiceStub)
    .overrideProvider(ChatService)
    .useValue(chatServiceStub)
    .compile();

  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
