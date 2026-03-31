import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdultPartialIndex1774975764322 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contents_adult
      ON contents (tmdb_id, content_type)
      WHERE adult = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_contents_adult');
  }
}
