import type { CookieOptions, Response } from 'express';

export const AUTH_ACCESS_TOKEN_COOKIE = 'filmott_access_token';
export const AUTH_REFRESH_TOKEN_COOKIE = 'filmott_refresh_token';

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function createCookieOptions(isProduction: boolean, maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { access_token: string; refresh_token: string },
  isProduction: boolean,
): void {
  res.cookie(
    AUTH_ACCESS_TOKEN_COOKIE,
    tokens.access_token,
    createCookieOptions(isProduction, ACCESS_TOKEN_MAX_AGE),
  );
  res.cookie(
    AUTH_REFRESH_TOKEN_COOKIE,
    tokens.refresh_token,
    createCookieOptions(isProduction, REFRESH_TOKEN_MAX_AGE),
  );
}

export function clearAuthCookies(res: Response, isProduction: boolean): void {
  const options = createCookieOptions(isProduction);
  res.clearCookie(AUTH_ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(AUTH_REFRESH_TOKEN_COOKIE, options);
}
