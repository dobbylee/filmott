import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropChatTables1774100000000 implements MigrationInterface {
  name = 'DropChatTables1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "chat_messages"');
    await queryRunner.query('DROP TABLE IF EXISTS "chat_sessions"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_sessions" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_sessions_user"
        ON "chat_sessions" ("user_id", "updated_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" SERIAL PRIMARY KEY,
        "session_id" INTEGER NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
        "role" VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
        "content" TEXT NOT NULL,
        "recommendations" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_session"
        ON "chat_messages" ("session_id", "created_at")
    `);
  }
}
