import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GoogleService } from './social/google.service';
import { KakaoService } from './social/kakao.service';
import { NaverService } from './social/naver.service';
import { AuthProvider } from '../users/enums/auth-provider.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { SocialCallbackResult } from './auth.service';
import { ROLES_KEY } from './decorators/roles.decorator';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  SOCIAL_SIGNUP_COOKIE,
} from './auth-cookie.util';

describe('AuthController', () => {
  let controller: AuthController;

  const createMockResponse = () => ({
    cookie: jest.fn(),
    redirect: jest.fn(),
    clearCookie: jest.fn(),
  });

  const expectAuthCookies = (
    mockRes: ReturnType<typeof createMockResponse>,
    accessToken: string,
    refreshToken: string,
  ) => {
    expect(mockRes.cookie).toHaveBeenCalledWith(
      AUTH_ACCESS_TOKEN_COOKIE,
      accessToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    );
    expect(mockRes.cookie).toHaveBeenCalledWith(
      AUTH_REFRESH_TOKEN_COOKIE,
      refreshToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    );
  };

  const expectAuthCookiesCleared = (
    mockRes: ReturnType<typeof createMockResponse>,
  ) => {
    expect(mockRes.clearCookie).toHaveBeenCalledWith(
      AUTH_ACCESS_TOKEN_COOKIE,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    );
    expect(mockRes.clearCookie).toHaveBeenCalledWith(
      AUTH_REFRESH_TOKEN_COOKIE,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    );
  };

  const expectSignupCookie = (
    mockRes: ReturnType<typeof createMockResponse>,
    signupToken: string,
  ) => {
    expect(mockRes.cookie).toHaveBeenCalledWith(
      SOCIAL_SIGNUP_COOKIE,
      signupToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    );
  };

  const expectSignupCookieCleared = (
    mockRes: ReturnType<typeof createMockResponse>,
  ) => {
    expect(mockRes.clearCookie).toHaveBeenCalledWith(
      SOCIAL_SIGNUP_COOKIE,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    );
  };

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    refreshTokens: jest.fn(),
    revokeRefreshToken: jest.fn(),
    handleSocialCallback: jest.fn(),
    completeSocialSignup: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
    get: jest.fn().mockReturnValue('development'),
  };

  const mockGoogleService = {
    getAuthUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?test=1'),
    getProfile: jest.fn(),
  };

  const mockKakaoService = {
    getAuthUrl: jest
      .fn()
      .mockReturnValue('https://kauth.kakao.com/oauth/authorize?test=1'),
    getProfile: jest.fn(),
  };

  const mockNaverService = {
    getAuthUrl: jest
      .fn()
      .mockReturnValue('https://nid.naver.com/oauth2.0/authorize?test=1'),
    getProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GoogleService, useValue: mockGoogleService },
        { provide: KakaoService, useValue: mockKakaoService },
        { provide: NaverService, useValue: mockNaverService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('정의되어 있어야 한다', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /auth/signup (register) -- ADMIN 전용', () => {
    it('authService.register를 호출하고 토큰과 사용자를 반환해야 한다', async () => {
      const dto = {
        nickname: 'test',
        email: 'test@test.com',
        password: 'password1',
      };
      const response = {
        access_token: 'token',
        refresh_token: 'refresh-token',
        user: { id: 1, nickname: 'test', email: 'test@test.com' },
      };
      mockAuthService.register.mockResolvedValue(response);

      const result = await controller.register(dto);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(response);
    });

    it('register 메서드에 JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        AuthController.prototype.register,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
      expect(guards).toContainEqual(RolesGuard);
    });

    it('register 메서드에 ADMIN 역할만 허용되어야 한다', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        AuthController.prototype.register,
      );
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });

  describe('POST /auth/login (login)', () => {
    it('authService.login을 호출하고 세션 쿠키를 설정한 뒤 사용자만 반환해야 한다', async () => {
      const dto = { email: 'test@test.com', password: 'password1' };
      const mockRes = createMockResponse();
      const response = {
        access_token: 'token',
        refresh_token: 'refresh-token',
        user: { id: 1, nickname: 'test', email: 'test@test.com' },
      };
      mockAuthService.login.mockResolvedValue(response);

      const result = await controller.login(dto, mockRes as never);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expectAuthCookies(mockRes, 'token', 'refresh-token');
      expect(result).toEqual({ user: response.user });
    });
  });

  describe('POST /auth/refresh', () => {
    it('쿠키의 refresh token으로 세션을 갱신하고 쿠키를 교체해야 한다', async () => {
      const mockReq = {
        cookies: { [AUTH_REFRESH_TOKEN_COOKIE]: 'valid-refresh-token' },
      };
      const mockRes = createMockResponse();
      const response = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        user: { id: 1, nickname: 'test', role: 'USER' },
      };
      mockAuthService.refreshTokens.mockResolvedValue(response);

      const result = await controller.refresh(
        mockReq as never,
        {} as RefreshTokenDto,
        mockRes as never,
      );

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'valid-refresh-token',
      );
      expectAuthCookies(mockRes, 'new-access-token', 'new-refresh-token');
      expect(result).toEqual({ user: response.user });
    });

    it('cookie가 없으면 body fallback으로 refresh token을 읽어야 한다', async () => {
      const mockReq = { cookies: {} };
      const mockRes = createMockResponse();
      const response = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        user: { id: 1, nickname: 'test', role: 'USER' },
      };
      mockAuthService.refreshTokens.mockResolvedValue(response);

      await controller.refresh(
        mockReq as never,
        { refresh_token: 'body-refresh-token' },
        mockRes as never,
      );

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'body-refresh-token',
      );
      expectAuthCookies(mockRes, 'new-access-token', 'new-refresh-token');
    });

    it('유효하지 않은 토큰이면 쿠키를 정리하고 UnauthorizedException을 던져야 한다', async () => {
      const mockReq = {
        cookies: { [AUTH_REFRESH_TOKEN_COOKIE]: 'invalid-token' },
      };
      const mockRes = createMockResponse();
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.'),
      );

      await expect(
        controller.refresh(
          mockReq as never,
          {} as RefreshTokenDto,
          mockRes as never,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(
        'invalid-token',
      );
      expectAuthCookiesCleared(mockRes);
    });
  });

  describe('POST /auth/logout', () => {
    it('정상적으로 토큰을 폐기하고 세션 쿠키를 삭제해야 한다', async () => {
      const mockReq = {
        cookies: { [AUTH_REFRESH_TOKEN_COOKIE]: 'valid-refresh-token' },
      };
      const mockRes = createMockResponse();
      mockAuthService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await controller.logout(
        mockReq as never,
        {} as RefreshTokenDto,
        mockRes as never,
      );

      expect(mockAuthService.revokeRefreshToken).toHaveBeenCalledWith(
        'valid-refresh-token',
      );
      expectAuthCookiesCleared(mockRes);
      expect(result).toBeUndefined();
    });
  });

  describe('GET /auth/google (googleRedirect)', () => {
    it('Google 인증 URL로 리다이렉트하고 state 쿠키를 설정해야 한다', () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        req: { cookies: {} },
      };

      controller.googleRedirect(mockRes as never);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'oauth_state',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          maxAge: 300000,
          path: '/',
        }),
      );
      expect(mockGoogleService.getAuthUrl).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(mockRes.redirect).toHaveBeenCalled();
    });
  });

  describe('P0-1: state 쿠키 secure가 NODE_ENV에 따라 설정되어야 한다', () => {
    it('development 환경에서 secure: false로 설정되어야 한다', () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
      };

      controller.googleRedirect(mockRes as never);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'oauth_state',
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );
    });

    it('production 환경에서 secure: true로 설정되어야 한다', async () => {
      const prodConfigService = {
        getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
        get: jest.fn().mockReturnValue('production'),
      };

      const module: TestingModule = await Test.createTestingModule({
        imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
        controllers: [AuthController],
        providers: [
          { provide: AuthService, useValue: mockAuthService },
          { provide: ConfigService, useValue: prodConfigService },
          { provide: GoogleService, useValue: mockGoogleService },
          { provide: KakaoService, useValue: mockKakaoService },
          { provide: NaverService, useValue: mockNaverService },
        ],
      }).compile();

      const prodController = module.get<AuthController>(AuthController);
      const mockRes = { cookie: jest.fn(), redirect: jest.fn() };
      prodController.googleRedirect(mockRes as never);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'oauth_state',
        expect.any(String),
        expect.objectContaining({ secure: true }),
      );
    });
  });

  describe('GET /auth/google/callback (googleCallback)', () => {
    it('기존 유저면 callback에서 바로 세션 쿠키를 설정하고 성공 플래그로 리다이렉트해야 한다', async () => {
      const mockRes = createMockResponse();
      const existingResult: SocialCallbackResult = {
        type: 'existing',
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          user: {
            id: 1,
            nickname: 'existinguser',
            role: 'USER',
            profileImage: null,
            subscribedOtts: [],
          },
        },
      };
      mockGoogleService.getProfile.mockResolvedValue({
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        email: 'e@e.com',
        nickname: null,
        profileImage: null,
      });
      mockAuthService.handleSocialCallback.mockResolvedValue(existingResult);

      const mockReq = { cookies: { oauth_state: 'valid-state' } };
      await controller.googleCallback(
        'code123',
        'valid-state',
        mockReq as never,
        mockRes as never,
      );

      expect(mockRes.clearCookie).toHaveBeenCalledWith('oauth_state', {
        path: '/',
      });
      expectAuthCookies(mockRes, 'access-token', 'refresh-token');
      expectSignupCookieCleared(mockRes);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('status=success'),
      );
      expect(mockRes.redirect).not.toHaveBeenCalledWith(
        expect.stringContaining('code='),
      );
    });

    it('신규 유저면 signup cookie를 설정하고 new=true로 리다이렉트해야 한다', async () => {
      const mockRes = createMockResponse();
      const newResult: SocialCallbackResult = {
        type: 'new',
        signupToken: 'signup-jwt-token',
      };
      mockGoogleService.getProfile.mockResolvedValue({
        provider: AuthProvider.GOOGLE,
        providerId: 'google-456',
        email: 'new@e.com',
        nickname: null,
        profileImage: null,
      });
      mockAuthService.handleSocialCallback.mockResolvedValue(newResult);

      const mockReq = { cookies: { oauth_state: 'valid-state' } };
      await controller.googleCallback(
        'code456',
        'valid-state',
        mockReq as never,
        mockRes as never,
      );

      expectSignupCookie(mockRes, 'signup-jwt-token');
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('new=true'),
      );
      expect(mockRes.redirect).not.toHaveBeenCalledWith(
        expect.stringContaining('tempToken='),
      );
    });

    it('state가 일치하지 않으면 에러와 함께 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };

      const mockReq = { cookies: { oauth_state: 'different-state' } };
      await controller.googleCallback(
        'code123',
        'wrong-state',
        mockReq as never,
        mockRes as never,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=invalid_state'),
      );
    });

    it('code가 없으면 에러와 함께 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };

      const mockReq = { cookies: { oauth_state: 'state' } };
      await controller.googleCallback(
        undefined as unknown as string,
        'state',
        mockReq as never,
        mockRes as never,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=missing_code'),
      );
    });

    it('P1-5: SUSPENDED 에러 시 suspended 에러 코드로 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };
      mockGoogleService.getProfile.mockResolvedValue({
        provider: AuthProvider.GOOGLE,
        providerId: 'google-suspended',
        email: 'sus@e.com',
        nickname: null,
        profileImage: null,
      });
      mockAuthService.handleSocialCallback.mockRejectedValue(
        new UnauthorizedException('정지된 계정입니다.'),
      );

      const mockReq = { cookies: { oauth_state: 'valid-state' } };
      await controller.googleCallback(
        'code-sus',
        'valid-state',
        mockReq as never,
        mockRes as never,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=suspended'),
      );
      // error.message 원문이 노출되지 않아야 한다
      expect(mockRes.redirect).not.toHaveBeenCalledWith(
        expect.stringContaining('정지된'),
      );
    });

    it('P1-5: DELETED 에러 시 deleted 에러 코드로 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };
      mockGoogleService.getProfile.mockResolvedValue({
        provider: AuthProvider.GOOGLE,
        providerId: 'google-deleted',
        email: 'del@e.com',
        nickname: null,
        profileImage: null,
      });
      mockAuthService.handleSocialCallback.mockRejectedValue(
        new UnauthorizedException('탈퇴한 계정입니다.'),
      );

      const mockReq = { cookies: { oauth_state: 'valid-state' } };
      await controller.googleCallback(
        'code-del',
        'valid-state',
        mockReq as never,
        mockRes as never,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=deleted'),
      );
    });

    it('P1-5: 일반 에러 시 social_auth_failed 에러 코드로 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };
      mockGoogleService.getProfile.mockRejectedValue(
        new Error('network error'),
      );

      const mockReq = { cookies: { oauth_state: 'valid-state' } };
      await controller.googleCallback(
        'code-err',
        'valid-state',
        mockReq as never,
        mockRes as never,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=social_auth_failed'),
      );
      // error.message가 직접 노출되지 않아야 한다
      expect(mockRes.redirect).not.toHaveBeenCalledWith(
        expect.stringContaining('network'),
      );
    });
  });

  describe('GET /auth/kakao (kakaoRedirect)', () => {
    it('Kakao 인증 URL로 리다이렉트해야 한다', () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        req: { cookies: {} },
      };

      controller.kakaoRedirect(mockRes as never);

      expect(mockKakaoService.getAuthUrl).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(mockRes.redirect).toHaveBeenCalled();
    });
  });

  describe('GET /auth/naver (naverRedirect)', () => {
    it('Naver 인증 URL로 리다이렉트해야 한다', () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        req: { cookies: {} },
      };

      controller.naverRedirect(mockRes as never);

      expect(mockNaverService.getAuthUrl).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(mockRes.redirect).toHaveBeenCalled();
    });
  });

  describe('POST /auth/social/complete-signup (completeSocialSignup)', () => {
    it('signup cookie로 회원가입을 완료하고 세션 쿠키를 설정해야 한다', async () => {
      const dto = { nickname: 'newuser' };
      const mockReq = { cookies: { [SOCIAL_SIGNUP_COOKIE]: 'signup-token' } };
      const mockRes = createMockResponse();
      const response = {
        access_token: 'new-at',
        refresh_token: 'new-rt',
        user: { id: 1, nickname: 'newuser', email: 'e@e.com', role: 'USER' },
      };
      mockAuthService.completeSocialSignup.mockResolvedValue(response);

      const result = await controller.completeSocialSignup(
        mockReq as never,
        dto,
        mockRes as never,
      );

      expect(mockAuthService.completeSocialSignup).toHaveBeenCalledWith(
        'signup-token',
        'newuser',
        undefined,
      );
      expectSignupCookieCleared(mockRes);
      expectAuthCookies(mockRes, 'new-at', 'new-rt');
      expect(result).toEqual({ user: response.user });
    });

    it('signup cookie가 없으면 BadRequestException을 던지고 쿠키를 정리해야 한다', async () => {
      const mockReq = { cookies: {} };
      const mockRes = createMockResponse();

      await expect(
        controller.completeSocialSignup(
          mockReq as never,
          { nickname: 'newuser' },
          mockRes as never,
        ),
      ).rejects.toThrow(BadRequestException);

      expectSignupCookieCleared(mockRes);
    });
  });

  describe('ThrottlerGuard', () => {
    it('컨트롤러 레벨에 ThrottlerGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', AuthController);
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(ThrottlerGuard);
    });

    it('register 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(
        AuthController.prototype.register,
      );
      expect(
        allMetadataKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
    });

    it('login 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(
        AuthController.prototype.login,
      );
      expect(
        allMetadataKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
    });

    it('refresh 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(
        AuthController.prototype.refresh,
      );
      expect(
        allMetadataKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
    });

    it('logout 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(
        AuthController.prototype.logout,
      );
      expect(
        allMetadataKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
    });

    it('소셜 리다이렉트 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const googleKeys = Reflect.getMetadataKeys(
        AuthController.prototype.googleRedirect,
      );
      const kakaoKeys = Reflect.getMetadataKeys(
        AuthController.prototype.kakaoRedirect,
      );
      const naverKeys = Reflect.getMetadataKeys(
        AuthController.prototype.naverRedirect,
      );

      expect(
        googleKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
      expect(
        kakaoKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
      expect(
        naverKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
    });

    it('소셜 콜백 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const googleKeys = Reflect.getMetadataKeys(
        AuthController.prototype.googleCallback,
      );
      const kakaoKeys = Reflect.getMetadataKeys(
        AuthController.prototype.kakaoCallback,
      );
      const naverKeys = Reflect.getMetadataKeys(
        AuthController.prototype.naverCallback,
      );

      expect(
        googleKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
      expect(
        kakaoKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
      expect(
        naverKeys.some((key) => key.toString().includes('THROTTLER')),
      ).toBe(true);
    });

    it('completeSocialSignup 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const keys = Reflect.getMetadataKeys(
        AuthController.prototype.completeSocialSignup,
      );
      expect(keys.some((key) => key.toString().includes('THROTTLER'))).toBe(
        true,
      );
    });
  });
});
