import { MigrationInterface, QueryRunner } from 'typeorm';

export class SwitchToHnswIndex1774300000000 implements MigrationInterface {
  name = 'SwitchToHnswIndex1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // pgvector 확장이 없으면 스킵
    const hasVector = await queryRunner.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'vector'`,
    );
    if (!hasVector.length) return;

    // 기존 IVFFlat 인덱스 삭제 후 HNSW로 재생성
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_content_metadata_embedding"',
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_content_metadata_embedding" ON "content_metadata"
        USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_content_metadata_embedding"',
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_content_metadata_embedding" ON "content_metadata"
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `);
  }
}
