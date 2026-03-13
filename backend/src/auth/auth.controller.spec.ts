import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
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
        user: { id: 1, nickname: 'test', email: 'test@test.com' },
      };
      mockAuthService.login.mockResolvedValue(response);

      const result = await controller.login(dto);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
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
  });
});
