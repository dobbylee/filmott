import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUserEmailUnique1774977100000 implements MigrationInterface {
  name = 'DropUserEmailUnique1774977100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        email_unique_constraint TEXT;
      BEGIN
        SELECT con.conname
          INTO email_unique_constraint
        FROM pg_constraint con
        JOIN pg_class rel
          ON rel.oid = con.conrelid
        JOIN pg_attribute attr
          ON attr.attrelid = rel.oid
         AND attr.attnum = con.conkey[1]
        WHERE rel.relname = 'users'
          AND con.contype = 'u'
          AND array_length(con.conkey, 1) = 1
          AND attr.attname = 'email'
        LIMIT 1;

        IF email_unique_constraint IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "users" DROP CONSTRAINT %I',
            email_unique_constraint
          );
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        duplicate_email TEXT;
      BEGIN
        SELECT email
          INTO duplicate_email
        FROM "users"
        WHERE email IS NOT NULL
        GROUP BY email
        HAVING COUNT(*) > 1
        LIMIT 1;

        IF duplicate_email IS NOT NULL THEN
          RAISE EXCEPTION
            'Cannot restore unique users.email constraint because duplicate email exists: %',
            duplicate_email;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel
            ON rel.oid = con.conrelid
          JOIN pg_attribute attr
            ON attr.attrelid = rel.oid
           AND attr.attnum = con.conkey[1]
          WHERE rel.relname = 'users'
            AND con.contype = 'u'
            AND array_length(con.conkey, 1) = 1
            AND attr.attname = 'email'
        ) THEN
          ALTER TABLE "users"
            ADD CONSTRAINT "UQ_users_email" UNIQUE ("email");
        END IF;
      END $$;
    `);
  }
}
