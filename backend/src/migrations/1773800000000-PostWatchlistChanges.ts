import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostWatchlistChanges1773800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. refresh_tokens 테이블
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" SERIAL PRIMARY KEY,
        "token" VARCHAR(64) NOT NULL UNIQUE,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_token"
        ON "refresh_tokens" ("token");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_user"
        ON "refresh_tokens" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_expires"
        ON "refresh_tokens" ("expires_at");
    `);

    // 2. 소셜 로그인: AuthProvider enum + provider, provider_id 컬럼
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider_enum') THEN
          CREATE TYPE "auth_provider_enum" AS ENUM ('LOCAL', 'GOOGLE', 'KAKAO', 'NAVER');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "provider" "auth_provider_enum" NOT NULL DEFAULT 'LOCAL';
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "provider_id" VARCHAR;
    `);
    // 복합 유니크 제약 (이미 존재하면 skip)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_users_provider_provider_id'
        ) THEN
          ALTER TABLE "users"
            ADD CONSTRAINT "UQ_users_provider_provider_id" UNIQUE ("provider", "provider_id");
        END IF;
      END $$;
    `);

    // 3. profileImage
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "profile_image" VARCHAR;
    `);

    // 4. subscribedOtts
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "subscribed_otts" JSONB DEFAULT '[]';
    `);

    // 5. chat_sessions 테이블
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_sessions" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_sessions_user"
        ON "chat_sessions" ("user_id", "updated_at" DESC);
    `);

    // 6. chat_messages 테이블
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" SERIAL PRIMARY KEY,
        "session_id" INTEGER NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
        "role" VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
        "content" TEXT NOT NULL,
        "recommendations" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_session"
        ON "chat_messages" ("session_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 역순 DROP
    // 6. chat_messages
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_session";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages";`);

    // 5. chat_sessions
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_sessions_user";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions";`);

    // 4. subscribedOtts
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "subscribed_otts";`);

    // 3. profileImage
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profile_image";`);

    // 2. 소셜 로그인
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_provider_provider_id";
    `);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "provider_id";`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "provider";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "auth_provider_enum";`);

    // 1. refresh_tokens
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_expires";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_user";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_token";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens";`);
  }
}
