import { DataSource } from 'typeorm';
import {
  createIntegrationDataSource,
  createIntegrationTypeOrmOptions,
  hasIntegrationDatabaseConfig,
} from './helpers/database';

const describeWithDb = hasIntegrationDatabaseConfig()
  ? describe
  : describe.skip;

interface MigrationCountRow {
  count: number;
}

describeWithDb('migrations integration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createIntegrationDataSource();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('프로덕션 마이그레이션 적용 후 pending migration이 없어야 한다', async () => {
    expect(dataSource.isInitialized).toBe(true);
    await expect(dataSource.showMigrations()).resolves.toBe(false);

    const rows = await dataSource.query<MigrationCountRow[]>(
      'SELECT COUNT(*)::int AS count FROM "migrations"',
    );
    expect(rows[0]?.count).toBeGreaterThan(0);
  });

  it('integration TypeORM 설정은 synchronize 없이 migration으로 스키마를 관리해야 한다', () => {
    const options = createIntegrationTypeOrmOptions();

    expect(options.synchronize ?? false).toBe(false);
    expect(options.migrationsRun).toBe(true);
    expect(options.autoLoadEntities).toBe(false);
  });
});
