import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserPasswordNullable1774977200000 implements MigrationInterface {
  name = 'MakeUserPasswordNullable1774977200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "users"
          WHERE "password" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot restore NOT NULL users.password constraint because null password rows exist';
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
    );
  }
}
