import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

export class AddUserStatusAndRole1773600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum types
    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
    `);
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM ('USER', 'ADMIN');
    `);

    // 2. Add status and role columns
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "status" "user_status_enum" NOT NULL DEFAULT 'ACTIVE';
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" "user_role_enum" NOT NULL DEFAULT 'USER';
    `);

    // 3. Migrate existing soft-deleted users
    await queryRunner.query(`
      UPDATE "users" SET "status" = 'DELETED' WHERE "deleted_at" IS NOT NULL;
    `);

    // 4. Drop deleted_at column
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "deleted_at";
    `);

    // 5. Seed admin account (skip if env vars not set)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      // Use ON CONFLICT to avoid duplicate if admin already exists
      await queryRunner.query(`
        INSERT INTO "users" ("nickname", "email", "password", "status", "role")
        VALUES ('admin', $1, $2, 'ACTIVE', 'ADMIN')
        ON CONFLICT ("email") DO UPDATE SET "role" = 'ADMIN';
      `, [adminEmail, hashedPassword]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Re-add deleted_at column
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ;
    `);

    // 2. Migrate DELETED status back to soft delete
    await queryRunner.query(`
      UPDATE "users" SET "deleted_at" = now() WHERE "status" = 'DELETED';
    `);

    // 3. Remove admin seed (if exists)
    await queryRunner.query(`
      DELETE FROM "users" WHERE "nickname" = 'admin' AND "role" = 'ADMIN';
    `);

    // 4. Drop status and role columns
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "status";
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "role";
    `);

    // 5. Drop enum types
    await queryRunner.query(`
      DROP TYPE "user_role_enum";
    `);
    await queryRunner.query(`
      DROP TYPE "user_status_enum";
    `);
  }
}
