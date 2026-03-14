import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException } from '@nestjs/common';
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

describe('AuthController', () => {
  let controller: AuthController;

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
  };

  const mockGoogleService = {
    getAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?test=1'),
    getProfile: jest.fn(),
  };

  const mockKakaoService = {
    getAuthUrl: jest.fn().mockReturnValue('https://kauth.kakao.com/oauth/authorize?test=1'),
    getProfile: jest.fn(),
  };

  const mockNaverService = {
    getAuthUrl: jest.fn().mockReturnValue('https://nid.naver.com/oauth2.0/authorize?test=1'),
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

  describe('POST /auth/signup (register) — ADMIN 전용', () => {
    it('authService.register를 호출하고 토큰과 사용자를 반환해야 한다', async () => {
      const dto = { nickname: 'test', email: 'test@test.com', password: 'password1' };
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
      const guards = Reflect.getMetadata('__guards__', AuthController.prototype.register);
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
      expect(guards).toContainEqual(RolesGuard);
    });

    it('register 메서드에 ADMIN 역할만 허용되어야 한다', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AuthController.prototype.register);
      expect(roles).toBeDefined();
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });

  describe('POST /auth/login (login)', () => {
    it('authService.login을 호출하고 토큰과 사용자를 반환해야 한다', async () => {
      const dto = { email: 'test@test.com', password: 'password1' };
      const response = {
        access_token: 'token',
        refresh_token: 'refresh-token',
        user: { id: 1, nickname: 'test', email: 'test@test.com' },
      };
      mockAuthService.login.mockResolvedValue(response);

      const result = await controller.login(dto);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(response);
    });
  });

  describe('POST /auth/refresh', () => {
    it('정상적으로 토큰을 갱신하고 새 토큰 쌍을 반환해야 한다', async () => {
      const dto = { refresh_token: 'valid-refresh-token' };
      const response = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        user: { id: 1, nickname: 'test', role: 'USER' },
      };
      mockAuthService.refreshTokens.mockResolvedValue(response);

      const result = await controller.refresh(dto);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('valid-refresh-token');
      expect(result).toEqual(response);
    });

    it('유효하지 않은 토큰이면 UnauthorizedException을 던져야 한다', async () => {
      const dto = { refresh_token: 'invalid-token' };
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.'),
      );

      await expect(controller.refresh(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('invalid-token');
    });
  });

  describe('POST /auth/logout', () => {
    it('정상적으로 토큰을 폐기해야 한다', async () => {
      const dto = { refresh_token: 'valid-refresh-token' };
      mockAuthService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await controller.logout(dto);

      expect(mockAuthService.revokeRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
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
          maxAge: 300000,
          path: '/',
        }),
      );
      expect(mockGoogleService.getAuthUrl).toHaveBeenCalledWith(expect.any(String));
      expect(mockRes.redirect).toHaveBeenCalled();
    });
  });

  describe('GET /auth/google/callback (googleCallback)', () => {
    it('기존 유저면 토큰과 함께 프론트엔드로 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };
      const existingResult: SocialCallbackResult = {
        type: 'existing',
        tokens: { access_token: 'at', refresh_token: 'rt' },
        user: { id: 1, nickname: 'user', email: 'e@e.com', role: 'USER' },
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
      await controller.googleCallback('code123', 'valid-state', mockReq as never, mockRes as never);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('oauth_state', { path: '/' });
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3000/auth/callback?token=at&refresh=rt'),
      );
    });

    it('신규 유저면 tempToken과 함께 프론트엔드로 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };
      const newResult: SocialCallbackResult = {
        type: 'new',
        tempToken: 'temp-jwt-token',
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
      await controller.googleCallback('code456', 'valid-state', mockReq as never, mockRes as never);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('new=true&tempToken=temp-jwt-token'),
      );
    });

    it('state가 일치하지 않으면 에러와 함께 리다이렉트해야 한다', async () => {
      const mockRes = {
        cookie: jest.fn(),
        redirect: jest.fn(),
        clearCookie: jest.fn(),
      };

      const mockReq = { cookies: { oauth_state: 'different-state' } };
      await controller.googleCallback('code123', 'wrong-state', mockReq as never, mockRes as never);

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
      await controller.googleCallback(undefined as unknown as string, 'state', mockReq as never, mockRes as never);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=missing_code'),
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

      expect(mockKakaoService.getAuthUrl).toHaveBeenCalledWith(expect.any(String));
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

      expect(mockNaverService.getAuthUrl).toHaveBeenCalledWith(expect.any(String));
      expect(mockRes.redirect).toHaveBeenCalled();
    });
  });

  describe('POST /auth/social/complete-signup (completeSocialSignup)', () => {
    it('닉네임 설정 후 토큰과 사용자 정보를 반환해야 한다', async () => {
      const dto = { tempToken: 'temp-token', nickname: 'newuser' };
      const response = {
        access_token: 'new-at',
        refresh_token: 'new-rt',
        user: { id: 1, nickname: 'newuser', email: 'e@e.com', role: 'USER' },
      };
      mockAuthService.completeSocialSignup.mockResolvedValue(response);

      const result = await controller.completeSocialSignup(dto);

      expect(mockAuthService.completeSocialSignup).toHaveBeenCalledWith('temp-token', 'newuser');
      expect(result).toEqual(response);
    });
  });

  describe('ThrottlerGuard', () => {
    it('컨트롤러 레벨에 ThrottlerGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata('__guards__', AuthController);
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(ThrottlerGuard);
    });

    it('register 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(AuthController.prototype.register);
      expect(allMetadataKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
    });

    it('login 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(AuthController.prototype.login);
      expect(allMetadataKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
    });

    it('refresh 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(AuthController.prototype.refresh);
      expect(allMetadataKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
    });

    it('logout 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const allMetadataKeys = Reflect.getMetadataKeys(AuthController.prototype.logout);
      expect(allMetadataKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
    });

    it('소셜 리다이렉트 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const googleKeys = Reflect.getMetadataKeys(AuthController.prototype.googleRedirect);
      const kakaoKeys = Reflect.getMetadataKeys(AuthController.prototype.kakaoRedirect);
      const naverKeys = Reflect.getMetadataKeys(AuthController.prototype.naverRedirect);

      expect(googleKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
      expect(kakaoKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
      expect(naverKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
    });

    it('소셜 콜백 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const googleKeys = Reflect.getMetadataKeys(AuthController.prototype.googleCallback);
      const kakaoKeys = Reflect.getMetadataKeys(AuthController.prototype.kakaoCallback);
      const naverKeys = Reflect.getMetadataKeys(AuthController.prototype.naverCallback);

      expect(googleKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
      expect(kakaoKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
      expect(naverKeys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
    });

    it('completeSocialSignup 메서드에 Throttle 데코레이터가 있어야 한다', () => {
      const keys = Reflect.getMetadataKeys(AuthController.prototype.completeSocialSignup);
      expect(keys.some(key => key.toString().includes('THROTTLER'))).toBe(true);
    });
  });
});
