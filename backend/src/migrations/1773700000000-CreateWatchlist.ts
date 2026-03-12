import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchlist1773700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "watchlist" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "content_id" INTEGER NOT NULL REFERENCES "contents"("id") ON DELETE CASCADE,
        "status" VARCHAR(20) NOT NULL DEFAULT 'want_to_watch',
        "watched_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // UNIQUE constraint: one watchlist entry per user per content
    await queryRunner.query(`
      ALTER TABLE "watchlist"
      ADD CONSTRAINT "UQ_watchlist_user_content" UNIQUE ("user_id", "content_id");
    `);

    // INDEX for listing by status
    await queryRunner.query(`
      CREATE INDEX "IDX_watchlist_user_status" ON "watchlist" ("user_id", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_watchlist_user_status";`);
    await queryRunner.query(`DROP TABLE "watchlist";`);
  }
}
