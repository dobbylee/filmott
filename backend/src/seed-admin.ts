/**
 * 관리자 시드 스크립트
 * 사용법: npx ts-node src/seed-admin.ts
 *
 * .env에서 ADMIN_NICKNAME, ADMIN_EMAIL, ADMIN_PASSWORD를 읽어
 * users 테이블에 ADMIN 계정을 생성합니다.
 * 이미 동일 이메일의 ADMIN이 존재하면 스킵합니다.
 */
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

config();

const ADMIN_NICKNAME = process.env.ADMIN_NICKNAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_NICKNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('환경변수 ADMIN_NICKNAME, ADMIN_EMAIL, ADMIN_PASSWORD가 필요합니다.');
  process.exit(1);
}

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await ds.initialize();

  const existing = await ds.query(
    `SELECT id FROM users WHERE email = $1 AND role = 'ADMIN'`,
    [ADMIN_EMAIL],
  );

  if (existing.length > 0) {
    console.log(`ADMIN 계정이 이미 존재합니다 (id: ${existing[0].id}). 스킵합니다.`);
    await ds.destroy();
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD as string, 10);

  await ds.query(
    `INSERT INTO users (nickname, email, password, role, provider, status, created_at)
     VALUES ($1, $2, $3, 'ADMIN', 'LOCAL', 'ACTIVE', NOW())`,
    [ADMIN_NICKNAME, ADMIN_EMAIL, hashedPassword],
  );

  console.log(`ADMIN 계정 생성 완료: ${ADMIN_NICKNAME} (${ADMIN_EMAIL})`);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('시드 실패:', err);
  process.exit(1);
});
