import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '../users/enums/user-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
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
      const mockUser = {
        id: 1, nickname: 'testuser', email: 'test@example.com',
        password: 'hashedpassword', status: UserStatus.ACTIVE, role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password123');

      expect(result).toEqual({
        id: 1, nickname: 'testuser', email: 'test@example.com',
        status: UserStatus.ACTIVE, role: UserRole.USER,
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const mockUser = {
        id: 1, nickname: 'testuser', email: 'test@example.com',
        password: 'hashedpassword', status: UserStatus.ACTIVE, role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('test@example.com', 'wrongpass')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('notfound@example.com', 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with message for DELETED user', async () => {
      const mockUser = {
        id: 1, nickname: 'deleted_1_123', email: 'deleted_1_123@deleted.local',
        password: 'hashedpassword', status: UserStatus.DELETED, role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.validateUser('deleted_1_123@deleted.local', 'password123'))
        .rejects.toThrow(new UnauthorizedException('탈퇴한 계정입니다.'));
    });

    it('should throw UnauthorizedException with message for SUSPENDED user', async () => {
      const mockUser = {
        id: 1, nickname: 'testuser', email: 'test@example.com',
        password: 'hashedpassword', status: UserStatus.SUSPENDED, role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.validateUser('test@example.com', 'password123'))
        .rejects.toThrow(new UnauthorizedException('정지된 계정입니다.'));
    });
  });

  describe('login', () => {
    it('should correctly return an access token and user info with role', async () => {
      const mockUser = {
        id: 1, nickname: 'testuser', email: 'test@example.com',
        password: 'hashedpassword', status: UserStatus.ACTIVE, role: UserRole.USER,
      };
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const token = 'mocked.jwt.token';

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue(token);

      const result = await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        nickname: mockUser.nickname, sub: mockUser.id, role: UserRole.USER,
      });
      expect(result).toEqual({
        access_token: token,
        user: { id: 1, nickname: 'testuser', email: 'test@example.com', role: UserRole.USER },
      });
    });
  });

  describe('register', () => {
    it('should create user and return access token and user info with role', async () => {
      const createUserDto = { nickname: 'newuser', email: 'new@example.com', password: 'password123' };
      const createdUser = {
        id: 2, nickname: 'newuser', email: 'new@example.com',
        status: UserStatus.ACTIVE, role: UserRole.USER,
      };
      const token = 'new.jwt.token';

      const mockUsersServiceWithCreate = {
        ...mockUsersService,
        create: jest.fn().mockResolvedValue(createdUser),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: UsersService, useValue: mockUsersServiceWithCreate },
          { provide: JwtService, useValue: mockJwtService },
        ],
      }).compile();

      const freshService = module.get<AuthService>(AuthService);
      mockJwtService.sign.mockReturnValue(token);

      const result = await freshService.register(createUserDto);

      expect(mockUsersServiceWithCreate.create).toHaveBeenCalledWith(createUserDto);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        nickname: createdUser.nickname, sub: createdUser.id, role: UserRole.USER,
      });
      expect(result).toEqual({
        access_token: token,
        user: { id: 2, nickname: 'newuser', email: 'new@example.com', role: UserRole.USER },
      });
    });
  });
});
