import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRankingTitlePoster1773350000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rankings
        ADD COLUMN IF NOT EXISTS title VARCHAR(500),
        ADD COLUMN IF NOT EXISTS poster_url VARCHAR(1000);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rankings
        DROP COLUMN IF EXISTS title,
        DROP COLUMN IF EXISTS poster_url;
    `);
  }
}
