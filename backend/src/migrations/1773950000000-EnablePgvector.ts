import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgvector1773950000000 implements MigrationInterface {
  name = 'EnablePgvector1773950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS vector');
  }
}
