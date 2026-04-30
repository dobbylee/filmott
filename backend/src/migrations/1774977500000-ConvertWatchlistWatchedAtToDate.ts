import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertWatchlistWatchedAtToDate1774977500000 implements MigrationInterface {
  name = 'ConvertWatchlistWatchedAtToDate1774977500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "watchlist"
      ALTER COLUMN "watched_at" TYPE date
      USING ("watched_at" AT TIME ZONE 'Asia/Seoul')::date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "watchlist"
      ALTER COLUMN "watched_at" TYPE timestamptz
      USING ("watched_at"::timestamp AT TIME ZONE 'Asia/Seoul')
    `);
  }
}
