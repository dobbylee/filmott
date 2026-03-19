import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContentMetadata1774000000000 implements MigrationInterface {
  name = 'CreateContentMetadata1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "content_metadata" (
        "id" SERIAL PRIMARY KEY,
        "content_id" INTEGER NOT NULL REFERENCES "contents"("id") ON DELETE CASCADE UNIQUE,
        "description" TEXT NOT NULL,
        "embedding" vector(1536) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_content_metadata_embedding" ON "content_metadata"
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_content_metadata_embedding"');
    await queryRunner.query('DROP TABLE IF EXISTS "content_metadata"');
  }
}
