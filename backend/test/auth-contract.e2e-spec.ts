import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { User } from '../src/users/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { AuthProvider } from '../src/users/enums/auth-provider.enum';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { createContractApp } from './contracts/contract-app';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

const providers = [
  ['google', AuthProvider.GOOGLE, 'accounts.google.com'],
  ['kakao', AuthProvider.KAKAO, 'kauth.kakao.com'],
  ['naver', AuthProvider.NAVER, 'nid.naver.com'],
] as const;

function cookies(response: request.Response): string[] {
  const value: unknown = response.headers['set-cookie'];
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error('set-cookie 응답이 없습니다.');
  }
  return value.map((item: string) => item.split(';', 1)[0]);
}

describe('인증 API 실제 외부 경계·HTTP·DB 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let externalFailure = false;

  beforeEach(async () => {
    externalFailure = false;
    harness = await createContractApp({
      http: (config) => {
        if (externalFailure) throw new Error('고정 OAuth 실패');
        switch (config.url) {
          case 'https://oauth2.googleapis.com/token':
          case 'https://kauth.kakao.com/oauth/token':
          case 'https://nid.naver.com/oauth2.0/token':
            return {
              access_token: 'provider-access-token',
              token_type: 'Bearer',
            };
          case 'https://www.googleapis.com/oauth2/v2/userinfo':
            return {
              id: '123',
              email: 'social@example.com',
              name: '외부닉네임',
            };
          case 'https://kapi.kakao.com/v2/user/me':
            return { id: 123, properties: { nickname: '외부닉네임' } };
          case 'https://openapi.naver.com/v1/nid/me':
            return {
              resultcode: '00',
              response: {
                id: '123',
                email: 'social@example.com',
                nickname: '외부닉네임',
              },
            };
          default:
            throw new Error(`미등록 fixture: ${config.url}`);
        }
      },
    });
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
  });

  afterEach(async () => {
    if (!harness) return;
    try {
      expect(harness.unexpected).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  async function begin(provider: string) {
    const response = await request(harness.app.getHttpServer())
      .get(`/api/auth/${provider}`)
      .expect(302);
    const url = new URL(response.headers.location);
    const state = url.searchParams.get('state');
    expect(state).toMatch(/^[a-f0-9]{32}$/);
    expect(cookies(response)).toEqual([`oauth_state_${state}=${provider}`]);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    return { url, state, cookie: cookies(response) };
  }

  it.each(providers)(
    '%s의 기존 사용자 OAuth는 실제 세션을 저장하고 성공 redirect해야 한다',
    async (provider, enumProvider, hostname) => {
      const user = await fixtures.user({
        provider: enumProvider,
        providerId: '123',
      });
      const flow = await begin(provider);
      expect(flow.url.hostname).toBe(hostname);
      const response = await request(harness.app.getHttpServer())
        .get(`/api/auth/${provider}/callback`)
        .query({ code: 'fixture-code', state: flow.state })
        .set('Cookie', flow.cookie)
        .expect(302);
      expect(response.headers.location).toBe(
        'http://contract.filmott.local/auth/callback?status=success',
      );
      expect(harness.httpCalls).toHaveLength(2);
      const [exchange, profileRequest] = harness.httpCalls;
      expect(exchange.method).toBe('post');
      expect(exchange.headers.get('Content-Type')).toBe(
        'application/x-www-form-urlencoded',
      );
      expect(
        Object.fromEntries(new URLSearchParams(String(exchange.data))),
      ).toEqual({
        grant_type: 'authorization_code',
        client_id: `contract-${provider.toUpperCase()}`,
        client_secret: 'contract-secret',
        code: 'fixture-code',
        ...(provider === 'naver'
          ? { state: flow.state }
          : {
              redirect_uri: `http://contract.filmott.local/api/auth/${provider}/callback`,
            }),
      });
      expect(profileRequest.method).toBe('get');
      expect(profileRequest.headers.get('Authorization')).toBe(
        'Bearer provider-access-token',
      );
      expect(
        await db.getRepository(RefreshToken).countBy({ userId: user.id }),
      ).toBe(1);
      const profile = await request(harness.app.getHttpServer())
        .get('/api/users/me')
        .set('Cookie', cookies(response))
        .expect(200);
      expect(profile.body.id).toBe(user.id);
      expect(profile.body).not.toHaveProperty('password');
      expect(response.headers.location).not.toContain('access_token');
    },
  );

  it.each(providers)(
    '%s 신규 가입은 signup cookie로 사용자와 세션을 한 번 생성해야 한다',
    async (provider, enumProvider) => {
      const flow = await begin(provider);
      const callback = await request(harness.app.getHttpServer())
        .get(`/api/auth/${provider}/callback`)
        .query({ code: 'fixture-code', state: flow.state })
        .set('Cookie', flow.cookie)
        .expect(302);
      expect(callback.headers.location).toMatch(/\?new=true#signup=/);
      expect(await db.getRepository(User).count()).toBe(0);
      const signupCookies = cookies(callback);
      const signup = await request(harness.app.getHttpServer())
        .post('/api/auth/social/complete-signup')
        .set('Cookie', signupCookies)
        .send({
          nickname: '가입닉네임',
          subscribedOtts: ['netflix'],
          signupToken: 'invalid-body-token',
        })
        .expect(200);
      expect(signup.body).toEqual({
        user: {
          id: 1,
          nickname: '가입닉네임',
          email: provider === 'kakao' ? null : 'social@example.com',
          role: 'USER',
          profileImage: null,
          subscribedOtts: ['netflix'],
        },
      });
      expect(signup.body).not.toHaveProperty('access_token');
      const saved = await db
        .getRepository(User)
        .findOneByOrFail({ provider: enumProvider, providerId: '123' });
      expect(saved.password).toBeNull();
      expect(
        await db.getRepository(RefreshToken).countBy({ userId: saved.id }),
      ).toBe(1);
      await request(harness.app.getHttpServer())
        .post('/api/auth/social/complete-signup')
        .set('Cookie', signupCookies)
        .send({ nickname: '다른닉네임' })
        .expect(409);
      expect(await db.getRepository(User).count()).toBe(1);
    },
  );

  it.each(providers)(
    '%s의 잘못된 state와 누락 code는 외부 호출 없이 오류 redirect해야 한다',
    async (provider) => {
      const callback = request(harness.app.getHttpServer());
      const missing = await callback
        .get(`/api/auth/${provider}/callback`)
        .expect(302);
      expect(missing.headers.location).toBe(
        'http://contract.filmott.local/auth/callback?error=missing_code',
      );
      const invalid = await request(harness.app.getHttpServer())
        .get(`/api/auth/${provider}/callback`)
        .query({ code: 'fixture-code', state: 'invalid' })
        .expect(302);
      expect(invalid.headers.location).toBe(
        'http://contract.filmott.local/auth/callback?error=invalid_state',
      );
      const state = 'a'.repeat(32);
      const mismatch = await request(harness.app.getHttpServer())
        .get(`/api/auth/${provider}/callback`)
        .query({ code: 'fixture-code', state })
        .set('Cookie', `oauth_state_${state}=wrong-provider`)
        .expect(302);
      expect(mismatch.headers.location).toBe(
        'http://contract.filmott.local/auth/callback?error=invalid_state',
      );
      expect(harness.httpCalls).toEqual([]);
      expect(await db.getRepository(RefreshToken).count()).toBe(0);
    },
  );

  it.each(providers)(
    '%s의 외부 실패와 정지 사용자는 세션을 만들지 않아야 한다',
    async (provider, enumProvider) => {
      const user = await fixtures.user({
        provider: enumProvider,
        providerId: '123',
        status: UserStatus.SUSPENDED,
      });
      const flow = await begin(provider);
      const suspended = await request(harness.app.getHttpServer())
        .get(`/api/auth/${provider}/callback`)
        .query({ code: 'fixture-code', state: flow.state })
        .set('Cookie', flow.cookie)
        .expect(302);
      expect(suspended.headers.location).toBe(
        'http://contract.filmott.local/auth/callback?error=suspended',
      );
      externalFailure = true;
      const failedFlow = await begin(provider);
      const failure = await request(harness.app.getHttpServer())
        .get(`/api/auth/${provider}/callback`)
        .query({ code: 'fixture-code', state: failedFlow.state })
        .set('Cookie', failedFlow.cookie)
        .expect(302);
      expect(failure.headers.location).toBe(
        'http://contract.filmott.local/auth/callback?error=social_auth_failed',
      );
      expect(await db.getRepository(RefreshToken).count()).toBe(0);
      expect(
        (await db.getRepository(User).findOneByOrFail({ id: user.id })).status,
      ).toBe(UserStatus.SUSPENDED);
    },
  );

  it('이메일 로그인은 ADMIN만 허용하고 유효한 USER 자격증명도 거부해야 한다', async () => {
    const { user, password } = await fixtures.loginAdmin();
    const login = () =>
      request(harness.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password });
    const success = await login().expect(200);
    expect(success.body.user).toMatchObject({ id: user.id, role: 'ADMIN' });
    expect(
      await db.getRepository(RefreshToken).countBy({ userId: user.id }),
    ).toBe(1);
    await db.getRepository(User).update(user.id, { role: UserRole.USER });
    await login().expect(401, {
      message: '소셜 로그인을 이용해주세요.',
      error: 'Unauthorized',
      statusCode: 401,
    });
    expect(
      await db.getRepository(RefreshToken).countBy({ userId: user.id }),
    ).toBe(1);
  });

  it('refresh 누락과 signup 만료는 오류이고 cookie 없는 logout은 204여야 한다', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .expect(401, {
        message: '리프레시 토큰이 필요합니다.',
        error: 'Unauthorized',
        statusCode: 401,
      });
    const expired = harness.app.get(JwtService).sign(
      {
        type: 'social_signup',
        provider: AuthProvider.GOOGLE,
        providerId: '123',
        email: 'social@example.com',
        nickname: null,
        profileImage: null,
      },
      { expiresIn: -60 },
    );
    const signup = await request(harness.app.getHttpServer())
      .post('/api/auth/social/complete-signup')
      .send({ nickname: '가입닉네임', signupToken: expired })
      .expect(400);
    expect(cookies(signup)).toContain('filmott_social_signup=');
    const logout = await request(harness.app.getHttpServer())
      .post('/api/auth/logout')
      .expect(204);
    expect(logout.text).toBe('');
    expect(cookies(logout)).toEqual([
      'filmott_access_token=',
      'filmott_refresh_token=',
    ]);
    expect(await db.getRepository(User).count()).toBe(0);
    expect(await db.getRepository(RefreshToken).count()).toBe(0);
  });
});
