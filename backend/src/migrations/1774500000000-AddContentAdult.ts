import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentAdult1774500000000 implements MigrationInterface {
  name = 'AddContentAdult1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "contents" ADD COLUMN "adult" BOOLEAN NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_contents_adult" ON "contents" ("adult") WHERE "adult" = true',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contents_adult"');
    await queryRunner.query('ALTER TABLE "contents" DROP COLUMN "adult"');
  }
}
