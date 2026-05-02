import path from 'path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../../../src/users/user.entity';
import { RefreshToken } from '../../../src/auth/entities/refresh-token.entity';
import { Content } from '../../../src/contents/content.entity';
import { Ranking } from '../../../src/rankings/ranking.entity';
import { Watchlist } from '../../../src/watchlist/watchlist.entity';
import { Review } from '../../../src/reviews/review.entity';
import { ReviewLike } from '../../../src/reviews/review-like.entity';
import { ReviewComment } from '../../../src/reviews/review-comment.entity';
import { ContentMetadata } from '../../../src/chat/entities/content-metadata.entity';

export interface IntegrationDatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export const INTEGRATION_ENTITIES = [
  User,
  RefreshToken,
  Content,
  Ranking,
  Watchlist,
  Review,
  ReviewLike,
  ReviewComment,
  ContentMetadata,
];

const DATA_TABLES = [
  'review_comments',
  'review_likes',
  'reviews',
  'watchlist',
  'rankings',
  'content_metadata',
  'refresh_tokens',
  'contents',
  'users',
];

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }
  return value;
}

export function getIntegrationDatabaseConfig(): IntegrationDatabaseConfig {
  const database = readRequiredEnv('TEST_DB_NAME');
  assertSafeTestDatabase(database);

  return {
    host: process.env.TEST_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT ?? '5432'),
    username: readRequiredEnv('TEST_DB_USERNAME'),
    password: readRequiredEnv('TEST_DB_PASSWORD'),
    database,
  };
}

export function hasIntegrationDatabaseConfig(): boolean {
  return Boolean(
    process.env.TEST_DB_NAME &&
    process.env.TEST_DB_USERNAME &&
    process.env.TEST_DB_PASSWORD,
  );
}

export function createIntegrationTypeOrmOptions(): TypeOrmModuleOptions {
  return {
    ...createIntegrationDataSourceOptions(),
    autoLoadEntities: false,
    migrationsRun: true,
    retryAttempts: 0,
  };
}

export function createIntegrationDataSourceOptions(): DataSourceOptions {
  const config = getIntegrationDatabaseConfig();

  return {
    type: 'postgres',
    ...config,
    entities: INTEGRATION_ENTITIES,
    migrations: [path.join(__dirname, '../../../src/migrations/*{.ts,.js}')],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      options: '-c timezone=Asia/Seoul',
      max: 5,
    },
  };
}

export async function createIntegrationDataSource(): Promise<DataSource> {
  const dataSource = new DataSource(createIntegrationDataSourceOptions());
  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}

export async function resetIntegrationDatabase(
  dataSource: DataSource,
): Promise<void> {
  const database = dataSource.options.database;
  if (typeof database !== 'string') {
    throw new Error('테스트 DB 이름을 확인할 수 없습니다.');
  }
  assertSafeTestDatabase(database);

  await dataSource.query(
    `TRUNCATE TABLE ${DATA_TABLES.join(', ')} RESTART IDENTITY`,
  );
}

function assertSafeTestDatabase(database: string): void {
  if (!/(test|integration)/i.test(database)) {
    throw new Error(
      `통합 테스트 DB 이름에는 test 또는 integration이 포함되어야 합니다: ${database}`,
    );
  }
}
