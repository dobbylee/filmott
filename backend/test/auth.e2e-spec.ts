import type { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
} from '../src/auth/auth-cookie.util';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { resetIntegrationDatabase } from './integration/helpers/database';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { createE2eTestApp } from './integration/helpers/test-app';

function getSetCookieHeaders(response: request.Response): string[] {
  const header: unknown = response.headers['set-cookie'];
  if (typeof header === 'string') return [header];
  if (
    Array.isArray(header) &&
    header.every((value) => typeof value === 'string')
  ) {
    return header;
  }
  return [];
}

function getCookiePair(response: request.Response, name: string): string {
  const cookie = getSetCookieHeaders(response).find((value) =>
    value.startsWith(`${name}=`),
  );
  if (!cookie) {
    throw new Error(`${name} Set-Cookie 헤더가 없습니다.`);
  }
  return cookie.split(';', 1)[0];
}

function getCookieValue(cookiePair: string): string {
  const separatorIndex = cookiePair.indexOf('=');
  if (separatorIndex < 0) {
    throw new Error('쿠키 형식이 올바르지 않습니다.');
  }
  return cookiePair.slice(separatorIndex + 1);
}

function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

describe('인증 cookie/JWT/refresh rotation e2e', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createE2eTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(dataSource);
  });

  afterAll(async () => {
    if (!app) return;

    try {
      await resetIntegrationDatabase(dataSource);
    } finally {
      await app.close();
    }
  });

  it('로그인부터 refresh rotation과 logout까지 실제 cookie 세션을 유지해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const { user, password } = await fixtures.loginAdmin();
    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post('/api/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    const initialAccessCookie = getCookiePair(
      loginResponse,
      AUTH_ACCESS_TOKEN_COOKIE,
    );
    const initialRefreshCookie = getCookiePair(
      loginResponse,
      AUTH_REFRESH_TOKEN_COOKIE,
    );
    expect(initialAccessCookie).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=`);
    expect(initialRefreshCookie).toContain(`${AUTH_REFRESH_TOKEN_COOKIE}=`);
    expect(getSetCookieHeaders(loginResponse)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HttpOnly'),
        expect.stringContaining('SameSite=Lax'),
      ]),
    );

    const profileBeforeRefresh = await agent.get('/api/users/me').expect(200);
    expect(profileBeforeRefresh.body).toMatchObject({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
    });
    expect(profileBeforeRefresh.body).not.toHaveProperty('password');

    const refreshRepository = dataSource.getRepository(RefreshToken);
    expect(await refreshRepository.find()).toEqual([
      expect.objectContaining({
        userId: user.id,
        token: hashRefreshToken(getCookieValue(initialRefreshCookie)),
      }),
    ]);

    const refreshResponse = await agent
      .post('/api/auth/refresh')
      .send({})
      .expect(200);
    const rotatedAccessCookie = getCookiePair(
      refreshResponse,
      AUTH_ACCESS_TOKEN_COOKIE,
    );
    const rotatedRefreshCookie = getCookiePair(
      refreshResponse,
      AUTH_REFRESH_TOKEN_COOKIE,
    );

    expect(rotatedAccessCookie).toContain(`${AUTH_ACCESS_TOKEN_COOKIE}=`);
    expect(rotatedRefreshCookie).not.toBe(initialRefreshCookie);
    expect(await refreshRepository.find()).toEqual([
      expect.objectContaining({
        userId: user.id,
        token: hashRefreshToken(getCookieValue(rotatedRefreshCookie)),
      }),
    ]);

    const reusedCookieResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', initialRefreshCookie)
      .send({})
      .expect(401);
    expect(reusedCookieResponse.body.message).toBe(
      '유효하지 않은 리프레시 토큰입니다.',
    );

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', rotatedAccessCookie)
      .expect(200);
    await agent.get('/api/users/me').expect(200);

    const logoutResponse = await agent
      .post('/api/auth/logout')
      .send({})
      .expect(204);
    expect(getSetCookieHeaders(logoutResponse)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${AUTH_ACCESS_TOKEN_COOKIE}=;`),
        expect.stringContaining(`${AUTH_REFRESH_TOKEN_COOKIE}=;`),
      ]),
    );
    expect(await refreshRepository.count()).toBe(0);

    await agent.get('/api/users/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rotatedRefreshCookie)
      .send({})
      .expect(401);
  });

  it('동일 refresh cookie의 동시 요청은 한 요청만 rotation에 성공해야 한다', async () => {
    const fixtures = createIntegrationFixtures(dataSource);
    const { user, password } = await fixtures.loginAdmin();
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password })
      .expect(200);
    const refreshCookie = getCookiePair(
      loginResponse,
      AUTH_REFRESH_TOKEN_COOKIE,
    );

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .send({}),
      request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .send({}),
    ]);

    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 401]);

    const successResponse = responses.find(
      (response) => response.status === 200,
    );
    if (!successResponse) {
      throw new Error('성공한 refresh 응답이 없습니다.');
    }
    const rotatedAccessCookie = getCookiePair(
      successResponse,
      AUTH_ACCESS_TOKEN_COOKIE,
    );
    const rotatedRefreshCookie = getCookiePair(
      successResponse,
      AUTH_REFRESH_TOKEN_COOKIE,
    );
    const storedTokens = await dataSource.getRepository(RefreshToken).find();
    expect(storedTokens).toEqual([
      expect.objectContaining({
        userId: user.id,
        token: hashRefreshToken(getCookieValue(rotatedRefreshCookie)),
      }),
    ]);
    expect(storedTokens[0].token).not.toBe(
      hashRefreshToken(getCookieValue(refreshCookie)),
    );

    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', rotatedAccessCookie)
      .expect(200);
  });
});
