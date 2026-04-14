import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignReviewAndDefaultColumns1774977300000 implements MigrationInterface {
  name = 'AlignReviewAndDefaultColumns1774977300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP COLUMN IF EXISTS "has_spoiler"`,
    );

    await queryRunner.query(`
      UPDATE "contents"
      SET "vote_count" = 0
      WHERE "vote_count" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "vote_count" SET DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "vote_count" SET NOT NULL`,
    );

    await queryRunner.query(`
      UPDATE "users"
      SET "subscribed_otts" = '[]'::jsonb
      WHERE "subscribed_otts" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "subscribed_otts" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "subscribed_otts" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "subscribed_otts" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ALTER COLUMN "vote_count" DROP NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "reviews"
      ADD COLUMN IF NOT EXISTS "has_spoiler" BOOLEAN NOT NULL DEFAULT false
    `);
  }
}
