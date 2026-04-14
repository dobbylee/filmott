import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchIndexes1774400000000 implements MigrationInterface {
  name = 'AddSearchIndexes1774400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contents_content_type" ON "contents" ("content_type")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contents_release_date" ON "contents" ("release_date")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contents_origin_country" ON "contents" ("origin_country")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contents_vote_count" ON "contents" ("vote_count" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_rankings_content_source" ON "rankings" ("content_id", "source")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_rankings_content_source"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contents_vote_count"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_contents_origin_country"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contents_release_date"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contents_content_type"');
  }
}
