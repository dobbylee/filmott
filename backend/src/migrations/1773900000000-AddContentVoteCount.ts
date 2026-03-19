import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentVoteCount1773900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contents"
        ADD COLUMN IF NOT EXISTS "vote_count" INTEGER DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contents" DROP COLUMN IF EXISTS "vote_count";
    `);
  }
}
