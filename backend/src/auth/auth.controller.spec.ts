import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    refreshTokens: jest.fn(),
    revokeRefreshToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
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

  describe('POST /auth/signup (register)', () => {
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
  });
});
