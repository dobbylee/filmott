import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgvector1773950000000 implements MigrationInterface {
  name = 'EnablePgvector1773950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PL/pgSQL로 에러 처리 — 로컬에 pgvector 미설치 시 트랜잭션 abort 방지
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE EXTENSION IF NOT EXISTS vector;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pgvector 확장 미설치 — 배포 환경에서 pgvector 이미지를 사용하세요.';
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS vector');
  }
}
