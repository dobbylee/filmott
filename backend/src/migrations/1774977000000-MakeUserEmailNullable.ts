import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserEmailNullable1774977000000 implements MigrationInterface {
  name = 'MakeUserEmailNullable1774977000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "users"
          WHERE "email" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot restore NOT NULL users.email constraint because null email rows exist';
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`,
    );
  }
}
