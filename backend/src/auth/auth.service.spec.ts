import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUsersService = {
    findOne: jest.fn(),
    findByEmail: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return user info without password if valid credentials are provided', async () => {
      const mockUser = { id: 1, nickname: 'testuser', email: 'test@example.com', password: 'hashedpassword' };
      mockUsersService.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('testuser', 'password123');

      expect(result).toEqual({ id: 1, nickname: 'testuser', email: 'test@example.com' });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const mockUser = { id: 1, nickname: 'testuser', email: 'test@example.com', password: 'hashedpassword' };
      mockUsersService.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('testuser', 'wrongpass')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('notfound', 'password123')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should correctly return an access token and user info', async () => {
      const mockUser = { id: 1, nickname: 'testuser', email: 'test@example.com', password: 'hashedpassword' };
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const token = 'mocked.jwt.token';

      mockUsersService.findOne.mockResolvedValue(null);
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue(token);

      const result = await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({ nickname: mockUser.nickname, sub: mockUser.id });
      expect(result).toEqual({
        access_token: token,
        user: { id: 1, nickname: 'testuser', email: 'test@example.com' },
      });
    });
  });
});
