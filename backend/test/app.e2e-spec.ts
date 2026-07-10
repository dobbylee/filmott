import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AUTH_REFRESH_TOKEN_COOKIE } from '../src/auth/auth-cookie.util';
import { resetIntegrationDatabase } from './integration/helpers/database';
import { createE2eTestApp } from './integration/helpers/test-app';

describe('실제 AppModule HTTP e2e', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createE2eTestApp();
    dataSource = app.get(DataSource);
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

  it('실제 public route를 /api prefix와 CORS 설정으로 제공해야 한다', async () => {
    await request(app.getHttpServer()).get('/').expect(404);

    const response = await request(app.getHttpServer())
      .get('/api')
      .set('Origin', 'http://e2e.filmott.local')
      .expect(200);

    expect(response.text).toBe('Hello World!');
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://e2e.filmott.local',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('전역 ValidationPipe가 허용되지 않은 body 필드를 거부해야 한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'e2e@filmott.local',
        password: 'password123',
        extra: 'blocked',
      })
      .expect(400);

    expect(response.body.message).toContain('property extra should not exist');
  });

  it('실제 JWT guard가 인증 없는 protected route를 거부해야 한다', async () => {
    await request(app.getHttpServer()).get('/api/users/me').expect(401);
  });

  it('cookie parser가 refresh cookie를 컨트롤러에 전달해야 한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', `${AUTH_REFRESH_TOKEN_COOKIE}=not-found`)
      .send({})
      .expect(401);

    expect(response.body.message).toBe('유효하지 않은 리프레시 토큰입니다.');
  });
});
