import { MigrationInterface, QueryRunner } from 'typeorm';

export class RebuildSchema1773120415728 implements MigrationInterface {
  name = 'RebuildSchema1773120415728';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop posts table
    await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "FK_c5a322ad12a7bf95460c958e80e"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "posts"`);

    // Modify users table: rename username -> nickname, add profile_image, add created_at, rename deletedAt -> deleted_at
    await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "username" TO "nickname"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" TO "UQ_users_nickname"`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "profile_image" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "deletedAt" TO "deleted_at"`);

    // Create contents table
    await queryRunner.query(`
      CREATE TABLE "contents" (
        "id" SERIAL NOT NULL,
        "tmdb_id" integer NOT NULL,
        "content_type" character varying(10) NOT NULL,
        "title" character varying(500) NOT NULL,
        "original_title" character varying(500),
        "poster_url" character varying(1000),
        "backdrop_url" character varying(1000),
        "overview" text,
        "release_date" date,
        "vote_average" numeric(3,1),
        "genres" jsonb NOT NULL DEFAULT '[]',
        "runtime" integer,
        "watch_providers" jsonb,
        "credits" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_contents_tmdb_id_type" UNIQUE ("tmdb_id", "content_type"),
        CONSTRAINT "PK_contents" PRIMARY KEY ("id")
      )
    `);

    // Create rankings table
    await queryRunner.query(`
      CREATE TABLE "rankings" (
        "id" SERIAL NOT NULL,
        "source" character varying(20) NOT NULL,
        "category" character varying(50) NOT NULL,
        "rank" integer NOT NULL,
        "content_id" integer,
        "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rankings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_rankings_source_category" ON "rankings" ("source", "category", "fetched_at" DESC)
    `);
    await queryRunner.query(`
      ALTER TABLE "rankings"
        ADD CONSTRAINT "FK_rankings_content_id"
        FOREIGN KEY ("content_id") REFERENCES "contents"("id")
    `);

    // Create reviews table
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" SERIAL NOT NULL,
        "user_id" integer NOT NULL,
        "content_id" integer NOT NULL,
        "rating" smallint CHECK (rating >= 1 AND rating <= 10),
        "comment" text,
        "has_spoiler" boolean NOT NULL DEFAULT false,
        "likes_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_reviews_user_content" UNIQUE ("user_id", "content_id"),
        CONSTRAINT "PK_reviews" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "reviews"
        ADD CONSTRAINT "FK_reviews_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        ADD CONSTRAINT "FK_reviews_content_id" FOREIGN KEY ("content_id") REFERENCES "contents"("id")
    `);

    // Create review_likes table
    await queryRunner.query(`
      CREATE TABLE "review_likes" (
        "id" SERIAL NOT NULL,
        "review_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_review_likes_review_user" UNIQUE ("review_id", "user_id"),
        CONSTRAINT "PK_review_likes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "review_likes"
        ADD CONSTRAINT "FK_review_likes_review_id" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "FK_review_likes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id")
    `);

    // Create review_comments table
    await queryRunner.query(`
      CREATE TABLE "review_comments" (
        "id" SERIAL NOT NULL,
        "review_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "content" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_comments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "review_comments"
        ADD CONSTRAINT "FK_review_comments_review_id" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "FK_review_comments_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new tables
    await queryRunner.query(`DROP TABLE IF EXISTS "review_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "review_likes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rankings_source_category"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rankings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contents"`);

    // Revert users table changes
    await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "deleted_at" TO "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "created_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profile_image"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME CONSTRAINT "UQ_users_nickname" TO "UQ_fe0bb3f6520ee0469504521e710"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "nickname" TO "username"`);

    // Recreate posts table
    await queryRunner.query(`CREATE TABLE "posts" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "content" text NOT NULL, "views" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "authorId" integer, CONSTRAINT "PK_2829ac61eff60fcec60d7274b9e" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "posts" ADD CONSTRAINT "FK_c5a322ad12a7bf95460c958e80e" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }
}
