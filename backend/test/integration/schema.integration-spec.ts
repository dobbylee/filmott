import { DataSource } from 'typeorm';
import {
  createIntegrationDataSource,
  hasIntegrationDatabaseConfig,
} from './helpers/database';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

interface ColumnRow {
  column_name: string;
  is_nullable: 'YES' | 'NO';
  data_type: string;
  udt_name: string;
  column_default: string | null;
  formatted_type: string;
}

describeWithDb('schema integration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createIntegrationDataSource();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function getColumn(
    tableName: string,
    columnName: string,
  ): Promise<ColumnRow> {
    const rows = await dataSource.query<ColumnRow[]>(
      `
      SELECT
        c.column_name,
        c.is_nullable,
        c.data_type,
        c.udt_name,
        c.column_default,
        format_type(a.atttypid, a.atttypmod) AS formatted_type
      FROM information_schema.columns c
      JOIN pg_class pc ON pc.relname = c.table_name
      JOIN pg_namespace pn
        ON pn.oid = pc.relnamespace
       AND pn.nspname = c.table_schema
      JOIN pg_attribute a
        ON a.attrelid = pc.oid
       AND a.attname = c.column_name
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
        AND c.column_name = $2
      `,
      [tableName, columnName],
    );
    const column = rows[0];
    if (!column) {
      throw new Error(`${tableName}.${columnName} 컬럼을 찾을 수 없습니다.`);
    }
    return column;
  }

  it('users 소셜 로그인 컬럼은 nullable 정책을 유지해야 한다', async () => {
    const email = await getColumn('users', 'email');
    const password = await getColumn('users', 'password');

    expect(email.is_nullable).toBe('YES');
    expect(email.udt_name).toBe('varchar');
    expect(password.is_nullable).toBe('YES');
    expect(password.udt_name).toBe('varchar');
  });

  it('contents adult와 vote_count 기본값은 entity와 일치해야 한다', async () => {
    const adult = await getColumn('contents', 'adult');
    const voteCount = await getColumn('contents', 'vote_count');

    expect(adult.is_nullable).toBe('NO');
    expect(adult.udt_name).toBe('bool');
    expect(adult.column_default).toContain('false');
    expect(voteCount.is_nullable).toBe('NO');
    expect(voteCount.udt_name).toBe('int4');
    expect(voteCount.column_default).toBe('0');
  });

  it('reviews likes_count 기본값은 0이어야 한다', async () => {
    const likesCount = await getColumn('reviews', 'likes_count');

    expect(likesCount.is_nullable).toBe('NO');
    expect(likesCount.udt_name).toBe('int4');
    expect(likesCount.column_default).toBe('0');
  });

  it('watchlist watched_at은 날짜 단위로 저장되어야 한다', async () => {
    const watchedAt = await getColumn('watchlist', 'watched_at');

    expect(watchedAt.is_nullable).toBe('YES');
    expect(watchedAt.data_type).toBe('date');
    expect(watchedAt.formatted_type).toBe('date');
  });

  it('content_metadata embedding은 pgvector 1536차원 컬럼이어야 한다', async () => {
    const embedding = await getColumn('content_metadata', 'embedding');

    expect(embedding.is_nullable).toBe('NO');
    expect(embedding.udt_name).toBe('vector');
    expect(embedding.formatted_type).toBe('vector(1536)');
  });
});
