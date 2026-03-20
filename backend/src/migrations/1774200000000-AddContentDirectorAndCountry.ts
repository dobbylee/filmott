import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentDirectorAndCountry1774200000000 implements MigrationInterface {
  name = 'AddContentDirectorAndCountry1774200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contents" ADD COLUMN IF NOT EXISTS "director" VARCHAR(200);
    `);
    await queryRunner.query(`
      ALTER TABLE "contents" ADD COLUMN IF NOT EXISTS "origin_country" VARCHAR(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN IF EXISTS "origin_country"`);
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN IF EXISTS "director"`);
  }
}
