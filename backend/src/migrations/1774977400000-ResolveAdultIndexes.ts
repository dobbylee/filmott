import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResolveAdultIndexes1774977400000 implements MigrationInterface {
  name = 'ResolveAdultIndexes1774977400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contents_adult"');
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contents_adult_updated_at"
      ON "contents" ("updated_at" DESC)
      WHERE "adult" = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contents_adult_lookup"
      ON "contents" ("content_type", "tmdb_id")
      WHERE "adult" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contents_adult_lookup"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_contents_adult_updated_at"',
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contents_adult"
      ON "contents" ("adult")
      WHERE "adult" = true
    `);
  }
}
