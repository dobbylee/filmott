import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRankingTargetDate1773500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // target_date 컬럼 추가 (기존 데이터는 fetched_at 기준으로 채움)
    await queryRunner.query(`
      ALTER TABLE rankings
      ADD COLUMN target_date DATE;
    `);

    // 기존 데이터: fetched_at 날짜를 target_date로 설정
    await queryRunner.query(`
      UPDATE rankings
      SET target_date = DATE(fetched_at)
      WHERE target_date IS NULL;
    `);

    // NOT NULL 제약 추가
    await queryRunner.query(`
      ALTER TABLE rankings
      ALTER COLUMN target_date SET NOT NULL;
    `);

    // 복합 유니크 제약 추가
    await queryRunner.query(`
      ALTER TABLE rankings
      ADD CONSTRAINT uq_rankings_source_category_rank_target_date
      UNIQUE (source, category, rank, target_date);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rankings
      DROP CONSTRAINT IF EXISTS uq_rankings_source_category_rank_target_date;
    `);

    await queryRunner.query(`
      ALTER TABLE rankings
      DROP COLUMN target_date;
    `);
  }
}
