import type { Response } from 'express';
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from './auth-cookie.util';

describe('auth cookie 설정', () => {
  const createResponse = () =>
    ({
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    }) as unknown as Response;

  it('운영 세션 쿠키는 Secure, HttpOnly, SameSite=Lax 속성을 사용해야 한다', () => {
    const response = createResponse();

    setAuthCookies(
      response,
      { access_token: 'access-token', refresh_token: 'refresh-token' },
      true,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      AUTH_ACCESS_TOKEN_COOKIE,
      'access-token',
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      AUTH_REFRESH_TOKEN_COOKIE,
      'refresh-token',
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('운영 세션 쿠키 삭제도 동일한 Secure 속성을 사용해야 한다', () => {
    const response = createResponse();

    clearAuthCookies(response, true);

    expect(response.clearCookie).toHaveBeenCalledWith(
      AUTH_ACCESS_TOKEN_COOKIE,
      expect.objectContaining({ secure: true, path: '/' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      AUTH_REFRESH_TOKEN_COOKIE,
      expect.objectContaining({ secure: true, path: '/' }),
    );
  });
});
