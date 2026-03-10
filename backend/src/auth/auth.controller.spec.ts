import { Test, TestingModule } from '@nestjs/testing';
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /auth/signup (register)', () => {
    it('should call authService.register and return token and user', async () => {
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
    it('should call authService.login and return token and user', async () => {
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
});
