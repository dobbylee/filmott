import { isNativeError } from 'node:util/types';
import { stripVTControlCharacters } from 'node:util';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { getIntegrationDatabaseConfig } from '../integration/helpers/database';

export interface ContractS3Fixture {
  command: 'PutObjectCommand' | 'DeleteObjectCommand';
  bucket: string;
  key: string;
  error?: Error;
}

export interface ContractTransport {
  s3?: ContractS3Fixture[];
  http?: (config: InternalAxiosRequestConfig) => unknown;
  fetch?: typeof globalThis.fetch;
  openaiKey?: string;
}

// 업무 provider는 실제 구현을 사용하고 외부 I/O 경계만 fixture로 대체한다.
export async function createContractApp(transport: ContractTransport = {}) {
  const database = getIntegrationDatabaseConfig();
  const config = new ConfigService({
    NODE_ENV: 'test',
    DB_HOST: database.host,
    DB_PORT: database.port,
    DB_USERNAME: database.username,
    DB_PASSWORD: database.password,
    DB_NAME: database.database,
    JWT_SECRET: 'filmott-contract-jwt-secret',
    FRONTEND_URL: 'http://contract.filmott.local',
    FRONTEND_INTERNAL_URL: 'http://contract.filmott.local',
    CORS_ORIGIN: 'http://contract.filmott.local',
    REVALIDATE_SECRET: 'contract-revalidate-secret',
    OPENAI_API_KEY: transport.openaiKey ?? '',
    TMDB_API_KEY: 'contract-tmdb-key',
    KOBIS_API_KEY: 'contract-kobis-key',
    R2_ACCOUNT_ID: 'contract',
    R2_BUCKET_NAME: 'contract',
    R2_PUBLIC_URL: 'https://images.contract.local',
    R2_ACCESS_KEY_ID: 'contract-access',
    R2_SECRET_ACCESS_KEY: 'contract-secret',
    ...Object.fromEntries(
      ['GOOGLE', 'KAKAO', 'NAVER'].flatMap((provider) => [
        [`${provider}_CLIENT_ID`, `contract-${provider}`],
        [`${provider}_CLIENT_SECRET`, 'contract-secret'],
        [
          `${provider}_CALLBACK_URL`,
          `http://contract.filmott.local/api/auth/${provider.toLowerCase()}/callback`,
        ],
      ]),
    ),
  });

  const assertionFailures: Error[] = [];
  const recordAssertion = (error: unknown) => {
    // Jest와 Node assert가 다른 VM realm에서 생성한 오류도 구분한다.
    const message = isNativeError(error)
      ? stripVTControlCharacters(error.message)
      : '';
    if (
      isNativeError(error) &&
      (error.constructor.name === 'JestAssertionError' ||
        ('code' in error && error.code === 'ERR_ASSERTION') ||
        (message.startsWith('expect(') &&
          message.includes('\n\nMatcher error:')))
    ) {
      assertionFailures.push(error);
    }
  };
  const unexpected: string[] = [];
  const httpCalls: InternalAxiosRequestConfig[] = [];
  const fetchCalls: { url: string; body: unknown }[] = [];
  const originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = async (request) => {
    httpCalls.push(request);
    if (!transport.http) {
      unexpected.push(
        `${request.method} ${request.baseURL ?? ''}${request.url}`,
      );
      throw new Error('등록되지 않은 외부 HTTP 요청');
    }
    try {
      const data = await transport.http(request);
      return {
        data,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config: request,
      };
    } catch (error) {
      recordAssertion(error);
      if (
        error instanceof Error &&
        error.message.startsWith('미등록 fixture')
      ) {
        unexpected.push(error.message);
      }
      throw error;
    }
  };
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      fetchCalls.push({ url, body: init?.body });
      if (url === 'http://contract.filmott.local/internal/revalidate') {
        return new Response('{}', { status: 200 });
      }
      if (transport.fetch) {
        try {
          return await transport.fetch(input, init);
        } catch (error) {
          recordAssertion(error);
          throw error;
        }
      }
      unexpected.push(url);
      throw new Error('등록되지 않은 외부 fetch 요청');
    });
  let s3FixtureIndex = 0;
  const s3Spy = jest
    .spyOn(S3Client.prototype, 'send')
    .mockImplementation((command: unknown) => {
      const kind =
        command instanceof PutObjectCommand
          ? 'PutObjectCommand'
          : command instanceof DeleteObjectCommand
            ? 'DeleteObjectCommand'
            : null;
      const input =
        command instanceof PutObjectCommand ||
        command instanceof DeleteObjectCommand
          ? command.input
          : undefined;
      const expected = transport.s3?.[s3FixtureIndex];
      if (
        !kind ||
        !expected ||
        expected.command !== kind ||
        expected.bucket !== input?.Bucket ||
        expected.key !== input?.Key
      ) {
        const message = `미등록 S3 fixture: ${kind ?? 'unknown'} ${input?.Bucket ?? ''}/${input?.Key ?? ''}`;
        unexpected.push(message);
        return Promise.reject(new Error(message)) as never;
      }
      s3FixtureIndex++;
      recordAssertion(expected.error);
      return (
        expected.error ? Promise.reject(expected.error) : Promise.resolve({})
      ) as never;
    });
  let app: INestApplication | undefined;
  const restore = () => {
    axios.defaults.adapter = originalAdapter;
    fetchSpy.mockRestore();
    s3Spy.mockRestore();
  };
  try {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    return {
      app,
      httpCalls,
      fetchCalls,
      s3Spy,
      unexpected,
      async close() {
        const closeErrors: unknown[] = [];
        try {
          await app?.close();
        } catch (error) {
          closeErrors.push(error);
        } finally {
          restore();
        }
        if (assertionFailures.length > 0 || closeErrors.length > 0) {
          throw new AggregateError(
            [...assertionFailures, ...closeErrors],
            '계약 fixture assertion 또는 앱 정리 실패',
          );
        }
      },
    };
  } catch (error) {
    try {
      await app?.close();
    } finally {
      restore();
    }
    throw error;
  }
}
