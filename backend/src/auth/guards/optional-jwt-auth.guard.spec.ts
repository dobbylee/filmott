import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { AUTH_ACCESS_TOKEN_COOKIE } from '../auth-cookie.util';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  const createContext = (request: {
    headers?: { authorization?: string };
    cookies?: Record<string, string | undefined>;
    user?: unknown;
  }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard();
  });

  it('자격증명이 없으면 익명 요청으로 통과시켜야 한다', () => {
    const request = { headers: {}, cookies: {} };
    const context = createContext(request);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toBeNull();
  });

  it('access cookie가 있으면 JWT 검증을 시도해야 한다', async () => {
    const request = {
      headers: {},
      cookies: { [AUTH_ACCESS_TOKEN_COOKIE]: 'cookie-token' },
    };
    const context = createContext(request);
    const parentCanActivate = jest
      .spyOn(
        Object.getPrototypeOf(OptionalJwtAuthGuard.prototype),
        'canActivate',
      )
      .mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);

    expect(parentCanActivate).toHaveBeenCalledWith(context);
    parentCanActivate.mockRestore();
  });

  it('Authorization 헤더가 있으면 JWT 검증을 시도해야 한다', async () => {
    const request = { headers: { authorization: 'Bearer token' }, cookies: {} };
    const context = createContext(request);
    const parentCanActivate = jest
      .spyOn(
        Object.getPrototypeOf(OptionalJwtAuthGuard.prototype),
        'canActivate',
      )
      .mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);

    expect(parentCanActivate).toHaveBeenCalledWith(context);
    parentCanActivate.mockRestore();
  });

  it('자격증명이 없으면 handleRequest가 null을 반환해야 한다', () => {
    const request = { headers: {}, cookies: {} };
    const context = createContext(request);

    expect(guard.handleRequest(null, null, null, context)).toBeNull();
    expect(request.user).toBeNull();
  });

  it('자격증명이 있는데 에러가 있으면 UnauthorizedException을 던져야 한다', () => {
    const context = createContext({
      headers: { authorization: 'Bearer invalid-token' },
      cookies: {},
    });

    expect(() =>
      guard.handleRequest(
        new UnauthorizedException('jwt expired'),
        null,
        null,
        context,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('자격증명이 있는데 user가 없으면 UnauthorizedException을 던져야 한다', () => {
    const context = createContext({
      headers: {},
      cookies: { [AUTH_ACCESS_TOKEN_COOKIE]: 'invalid-cookie-token' },
    });

    expect(() => guard.handleRequest(null, null, null, context)).toThrow(
      new UnauthorizedException('유효하지 않은 인증 정보입니다.'),
    );
  });

  it('유효한 user가 있으면 그대로 반환해야 한다', () => {
    const context = createContext({
      headers: { authorization: 'Bearer valid-token' },
      cookies: {},
    });
    const user = { id: 1, nickname: 'tester' };

    expect(guard.handleRequest(null, user, null, context)).toEqual(user);
  });
});
