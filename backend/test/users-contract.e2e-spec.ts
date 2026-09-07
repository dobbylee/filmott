import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { User } from '../src/users/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { AuthService } from '../src/auth/auth.service';
import { AuthProvider } from '../src/users/enums/auth-provider.enum';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { createContractApp } from './contracts/contract-app';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

describe('사용자 API 실제 HTTP·DB 동작 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let user: User;
  let token: string;
  const password = 'contract-password-123';
  const createdAt = new Date('2026-01-02T03:04:05.000Z');

  function sign(actor: User) {
    return harness.app.get(JwtService).sign({ sub: actor.id });
  }

  function safeUser(actor: User) {
    return {
      id: actor.id,
      nickname: actor.nickname,
      email: actor.email,
      provider: actor.provider,
      providerId: actor.providerId,
      profileImage: actor.profileImage ?? null,
      status: actor.status,
      role: actor.role,
      subscribedOtts: actor.subscribedOtts,
      createdAt: actor.createdAt.toISOString(),
    };
  }

  beforeEach(async () => {
    harness = await createContractApp();
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
    user = await fixtures.user({
      nickname: 'contract_user',
      email: 'contract@example.com',
      password: await bcrypt.hash(password, 4),
      createdAt,
    });
    token = sign(user);
  });

  afterEach(async () => {
    if (!harness) return;
    try {
      expect(harness.unexpected).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('동일 프로필 입력은 password 없이 동일한 전체 응답을 반환해야 한다', async () => {
    for (let run = 0; run < 2; run++) {
      const response = await request(harness.app.getHttpServer())
        .get('/api/users/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(response.body).toEqual(safeUser(user));
    }
  });

  it.each([
    ['get', '/api/users/me'],
    ['post', '/api/users/me/verify-password'],
    ['patch', '/api/users/me'],
    ['patch', '/api/users/me/otts'],
    ['delete', '/api/users/me'],
    ['post', '/api/users/me/profile-image'],
    ['delete', '/api/users/me/profile-image'],
    ['get', '/api/users/admin'],
    ['patch', '/api/users/admin/1/status'],
  ] as const)(
    '인증 없는 %s %s 요청은 업무 실행 전에 거부해야 한다',
    async (method, path) => {
      await request(harness.app.getHttpServer())[method](path).expect(401);
      expect(await db.getRepository(User).count()).toBe(1);
      expect(harness.s3Spy).not.toHaveBeenCalled();
      expect(harness.httpCalls).toEqual([]);
    },
  );

  it('닉네임 검사는 1분에 5회를 넘으면 429를 반환해야 한다', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(harness.app.getHttpServer())
        .get('/api/users/check-nickname/new_name')
        .expect(200);
    }
    await request(harness.app.getHttpServer())
      .get('/api/users/check-nickname/new_name')
      .expect(429);
  });

  it('5MiB 초과 파일은 SDK 호출이나 DB 저장 전에 거부해야 한다', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/users/me/profile-image')
      .auth(token, { type: 'bearer' })
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(harness.s3Spy).not.toHaveBeenCalled();
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .profileImage,
    ).toBeNull();
  });

  it('닉네임 중복 검사와 현재 비밀번호 검증의 상태·응답을 유지해야 한다', async () => {
    await request(harness.app.getHttpServer())
      .get('/api/users/check-nickname/contract_user')
      .expect(200, { available: false });
    await request(harness.app.getHttpServer())
      .get('/api/users/check-nickname/new_name')
      .expect(200, { available: true });
    const verify = (body: object) =>
      request(harness.app.getHttpServer())
        .post('/api/users/me/verify-password')
        .auth(token, { type: 'bearer' })
        .send(body);
    await verify({ password }).expect(200, { verified: true });
    await verify({ password: 'wrong-password' }).expect(400, {
      message: '현재 비밀번호가 올바르지 않습니다.',
      error: 'Bad Request',
      statusCode: 400,
    });
    await verify({}).expect(400, {
      message: '비밀번호를 입력해주세요.',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('닉네임·비밀번호 변경을 저장하고 중복·DTO 오류는 저장하지 않아야 한다', async () => {
    await fixtures.user({ nickname: 'occupied' });
    const patch = (body: object) =>
      request(harness.app.getHttpServer())
        .patch('/api/users/me')
        .auth(token, { type: 'bearer' })
        .send(body);
    await patch({ nickname: 'occupied' }).expect(409);
    await patch({ nickname: 'x', extra: true }).expect(400);
    const nextPassword = 'New-password-456!';
    await patch({
      nickname: 'failed_rename',
      newPassword: nextPassword,
    }).expect(400, {
      message: '비밀번호 변경을 위해 현재 비밀번호를 입력해주세요.',
      error: 'Bad Request',
      statusCode: 400,
    });
    await patch({
      nickname: 'failed_rename',
      currentPassword: 'Wrong-password-123!',
      newPassword: nextPassword,
    }).expect(400, {
      message: '현재 비밀번호가 올바르지 않습니다.',
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(
      await db.getRepository(User).findOneByOrFail({ id: user.id }),
    ).toMatchObject({ nickname: user.nickname, password: user.password });
    const result = await patch({
      nickname: 'changed_name',
      currentPassword: password,
      newPassword: nextPassword,
    }).expect(200);
    expect(result.body).toEqual({
      ...safeUser(user),
      nickname: 'changed_name',
    });
    const saved = await db.getRepository(User).findOneByOrFail({ id: user.id });
    expect(saved.nickname).toBe('changed_name');
    expect(await bcrypt.compare(nextPassword, saved.password!)).toBe(true);
    expect(await bcrypt.compare(password, saved.password!)).toBe(false);
  });

  it('소셜 사용자의 비밀번호 변경은 400으로 거부하고 DB를 유지해야 한다', async () => {
    const social = await fixtures.user({
      provider: AuthProvider.GOOGLE,
      providerId: 'contract-google-user',
      password: null,
    });
    await request(harness.app.getHttpServer())
      .patch('/api/users/me')
      .auth(sign(social), { type: 'bearer' })
      .send({
        nickname: 'failed_rename',
        currentPassword: password,
        newPassword: 'New-password-456!',
      })
      .expect(400, {
        message: '소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.',
        error: 'Bad Request',
        statusCode: 400,
      });
    expect(
      await db.getRepository(User).findOneByOrFail({ id: social.id }),
    ).toMatchObject({ nickname: social.nickname, password: null });
  });

  it('OTT 배열 저장·초기화와 지원하지 않는 값의 오류를 보존해야 한다', async () => {
    const patch = (otts: unknown) =>
      request(harness.app.getHttpServer())
        .patch('/api/users/me/otts')
        .auth(token, { type: 'bearer' })
        .send({ otts });
    const saved = await patch(['netflix', 'tving', 'netflix']).expect(200);
    expect(saved.body).toEqual({
      ...safeUser(user),
      subscribedOtts: ['netflix', 'tving', 'netflix'],
    });
    await patch(['unknown']).expect(400);
    await patch('netflix').expect(400);
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .subscribedOtts,
    ).toEqual(['netflix', 'tving', 'netflix']);
    await patch([]).expect(200);
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .subscribedOtts,
    ).toEqual([]);
  });

  it('관리자 목록은 탈퇴 계정·password를 제외하고 검색 문자를 literal로 처리해야 한다', async () => {
    const admin = await fixtures.user({
      role: UserRole.ADMIN,
      nickname: 'admin_actor',
    });
    await fixtures.user({ nickname: 'match_%_name' });
    await fixtures.user({ nickname: 'match_abc_name' });
    await fixtures.user({
      nickname: 'deleted_%_name',
      status: UserStatus.DELETED,
    });
    await request(harness.app.getHttpServer())
      .get('/api/users/admin')
      .expect(401);
    await request(harness.app.getHttpServer())
      .get('/api/users/admin')
      .auth(token, { type: 'bearer' })
      .expect(403);
    const response = await request(harness.app.getHttpServer())
      .get('/api/users/admin')
      .query({ search: '%', page: '0', limit: '200' })
      .auth(sign(admin), { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(
      response.body.users.map((item: { nickname: string }) => item.nickname),
    ).toEqual(['match_%_name']);
    expect(response.body.users[0]).not.toHaveProperty('password');
  });

  it('관리자 정지는 refresh를 폐기하고 기존 JWT를 거부하며 복구 후 다시 허용해야 한다', async () => {
    const admin = await fixtures.user({ role: UserRole.ADMIN });
    const other = await fixtures.user();
    await harness.app.get(AuthService).generateTokens(other);
    const existingRefresh = await db
      .getRepository(RefreshToken)
      .findBy({ userId: other.id });
    await request(harness.app.getHttpServer())
      .patch(`/api/users/admin/${other.id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'SUSPENDED' })
      .expect(403);
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: other.id })).status,
    ).toBe(UserStatus.ACTIVE);
    expect(
      await db.getRepository(RefreshToken).findBy({ userId: other.id }),
    ).toEqual(existingRefresh);
    await harness.app.get(AuthService).generateTokens(user);
    expect(
      await db.getRepository(RefreshToken).countBy({ userId: user.id }),
    ).toBe(1);
    const update = (id: number, status: string) =>
      request(harness.app.getHttpServer())
        .patch(`/api/users/admin/${id}/status`)
        .auth(sign(admin), { type: 'bearer' })
        .send({ status });
    await update(user.id, 'SUSPENDED').expect(200);
    expect(
      await db.getRepository(RefreshToken).countBy({ userId: user.id }),
    ).toBe(0);
    await request(harness.app.getHttpServer())
      .get('/api/users/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
    await update(admin.id, 'SUSPENDED').expect(400);
    await update(99999, 'ACTIVE').expect(404);
    await update(user.id, 'DELETED').expect(400);
    await update(user.id, 'ACTIVE').expect(200);
    await request(harness.app.getHttpServer())
      .get('/api/users/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
  });

  it('공개 프로필의 실제 통계와 정지 마스킹·탈퇴 404를 보존해야 한다', async () => {
    const content = await fixtures.content();
    await fixtures.review({ userId: user.id, contentId: content.id });
    await fixtures.watchlist({
      userId: user.id,
      contentId: content.id,
      status: 'watched',
    });
    const url = `/api/users/${user.id}/profile`;
    await request(harness.app.getHttpServer()).get(url).expect(200, {
      id: user.id,
      nickname: user.nickname,
      profileImage: null,
      createdAt: createdAt.toISOString(),
      reviewCount: 1,
      watchedCount: 1,
      wantToWatchCount: 0,
    });
    await db
      .getRepository(User)
      .update(user.id, { status: UserStatus.SUSPENDED });
    await request(harness.app.getHttpServer()).get(url).expect(200, {
      id: user.id,
      nickname: '정지된 사용자',
      profileImage: null,
      createdAt: createdAt.toISOString(),
      reviewCount: 0,
      watchedCount: 0,
      wantToWatchCount: 0,
    });
    await db
      .getRepository(User)
      .update(user.id, { status: UserStatus.DELETED });
    await request(harness.app.getHttpServer()).get(url).expect(404);
  });

  it('multipart 이미지는 실제 webp로 변환해 SDK에 보내고 URL을 저장해야 한다', async () => {
    const png = await sharp({
      create: { width: 3, height: 2, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const response = await request(harness.app.getHttpServer())
      .post('/api/users/me/profile-image')
      .auth(token, { type: 'bearer' })
      .attach('image', png, {
        filename: 'fixture.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(harness.s3Spy).toHaveBeenCalledTimes(1);
    const command = harness.s3Spy.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    if (!(command instanceof PutObjectCommand))
      throw new Error('잘못된 SDK 명령');
    expect(command.input).toMatchObject({
      Bucket: 'contract',
      ContentType: 'image/webp',
    });
    const metadata = await sharp(command.input.Body as Buffer).metadata();
    expect(metadata).toMatchObject({ width: 200, height: 200, format: 'webp' });
    expect(response.body.profileImage).toBe(
      `https://images.contract.local/${command.input.Key}`,
    );
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .profileImage,
    ).toBe(response.body.profileImage);
    expect(response.body).not.toHaveProperty('password');
    await request(harness.app.getHttpServer())
      .post('/api/users/me/profile-image')
      .auth(token, { type: 'bearer' })
      .expect(400);
    await request(harness.app.getHttpServer())
      .post('/api/users/me/profile-image')
      .auth(token, { type: 'bearer' })
      .attach('image', Buffer.from('text'), 'fixture.txt')
      .expect(400);
    expect(harness.s3Spy).toHaveBeenCalledTimes(1);
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .profileImage,
    ).toBe(response.body.profileImage);
  });

  it('이미지 삭제의 현재 응답과 DB 저장 결과 차이를 기록해야 한다', async () => {
    const profileImage = 'https://images.contract.local/profiles/existing.webp';
    await db.getRepository(User).update(user.id, { profileImage });
    const response = await request(harness.app.getHttpServer())
      .delete('/api/users/me/profile-image')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body).not.toHaveProperty('profileImage');
    expect(harness.s3Spy).toHaveBeenCalledTimes(1);
    const command = harness.s3Spy.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    if (!(command instanceof DeleteObjectCommand))
      throw new Error('잘못된 SDK 명령');
    expect(command.input).toEqual({
      Bucket: 'contract',
      Key: 'profiles/existing.webp',
    });
    // 기존 동작: undefined는 TypeORM UPDATE 대상이 아니므로 DB URL이 남는다.
    // 이 기준선 작업에서 null 저장으로 고치지 않고 별도 기존 문제로 기록한다.
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .profileImage,
    ).toBe(profileImage);
  });

  it('탈퇴는 204와 익명화·refresh 폐기·기존 JWT 거부를 유지해야 한다', async () => {
    await harness.app.get(AuthService).generateTokens(user);
    const result = await request(harness.app.getHttpServer())
      .delete('/api/users/me')
      .auth(token, { type: 'bearer' })
      .expect(204);
    expect(result.text).toBe('');
    const saved = await db.getRepository(User).findOneByOrFail({ id: user.id });
    expect(saved.status).toBe(UserStatus.DELETED);
    expect(saved.nickname).toMatch(new RegExp(`^deleted_${user.id}_\\d+$`));
    expect(saved.email).toBe(`${saved.nickname}@deleted.local`);
    expect(saved.providerId).toBeNull();
    expect(
      await db.getRepository(RefreshToken).countBy({ userId: user.id }),
    ).toBe(0);
    await request(harness.app.getHttpServer())
      .get('/api/users/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
});
