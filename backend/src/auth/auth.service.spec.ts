import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '../users/enums/user-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { RefreshToken } from './entities/refresh-token.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findByIdWithStatus: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockRefreshTokenRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('유효한 자격 증명이 제공되면 비밀번호 없는 사용자 정보를 반환해야 한다', async () => {
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

    it('비밀번호가 일치하지 않으면 UnauthorizedException을 던져야 한다', async () => {
      const mockUser = {
        id: 1, nickname: 'testuser', email: 'test@example.com',
        password: 'hashedpassword', status: UserStatus.ACTIVE, role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('test@example.com', 'wrongpass')).rejects.toThrow(UnauthorizedException);
    });

    it('사용자를 찾을 수 없으면 UnauthorizedException을 던져야 한다', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('notfound@example.com', 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('DELETED 사용자에 대해 메시지와 함께 UnauthorizedException을 던져야 한다', async () => {
      const mockUser = {
        id: 1, nickname: 'deleted_1_123', email: 'deleted_1_123@deleted.local',
        password: 'hashedpassword', status: UserStatus.DELETED, role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.validateUser('deleted_1_123@deleted.local', 'password123'))
        .rejects.toThrow(new UnauthorizedException('탈퇴한 계정입니다.'));
    });

    it('SUSPENDED 사용자에 대해 메시지와 함께 UnauthorizedException을 던져야 한다', async () => {
      const mockUser = {
        id: 1, nickname: 'testuser', email: 'test@example.com',
        password: 'hashedpassword', status: UserStatus.SUSPENDED, role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.validateUser('test@example.com', 'password123'))
        .rejects.toThrow(new UnauthorizedException('정지된 계정입니다.'));
    });
  });

  describe('generateTokens', () => {
    it('access_token과 refresh_token을 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'testuser', role: UserRole.USER };
      mockJwtService.sign.mockReturnValue('mocked.jwt.token');
      mockRefreshTokenRepo.create.mockReturnValue({ token: 'mock-refresh', userId: 1 });
      mockRefreshTokenRepo.save.mockResolvedValue({ token: 'mock-refresh', userId: 1 });

      const result = await service.generateTokens(user);

      expect(result.access_token).toBe('mocked.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(typeof result.refresh_token).toBe('string');
      expect(result.refresh_token.length).toBe(64);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        nickname: 'testuser', sub: 1, role: UserRole.USER,
      });
    });

    it('refresh token을 DB에 저장해야 한다', async () => {
      const user = { id: 1, nickname: 'testuser', role: UserRole.USER };
      mockJwtService.sign.mockReturnValue('mocked.jwt.token');
      mockRefreshTokenRepo.create.mockImplementation((data: Partial<RefreshToken>) => data);
      mockRefreshTokenRepo.save.mockResolvedValue({});

      await service.generateTokens(user);

      expect(mockRefreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
      expect(mockRefreshTokenRepo.save).toHaveBeenCalled();

      const createArg = mockRefreshTokenRepo.create.mock.calls[0][0] as { expiresAt: Date };
      const now = new Date();
      const daysDiff = (createArg.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThan(6.9);
      expect(daysDiff).toBeLessThan(7.1);
    });
  });

  describe('refreshTokens', () => {
    const mockTokenEntity = {
      id: 1,
      token: 'valid-refresh-token',
      userId: 1,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    };

    it('정상적으로 토큰을 rotation하고 새 토큰 쌍을 반환해야 한다', async () => {
      mockRefreshTokenRepo.findOne.mockResolvedValue(mockTokenEntity);
      mockUsersService.findByIdWithStatus.mockResolvedValue({
        id: 1, nickname: 'testuser', status: UserStatus.ACTIVE, role: UserRole.USER,
      });
      mockRefreshTokenRepo.remove.mockResolvedValue(mockTokenEntity);
      mockJwtService.sign.mockReturnValue('new.jwt.token');
      mockRefreshTokenRepo.create.mockImplementation((data: Partial<RefreshToken>) => data);
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result.access_token).toBe('new.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(result.user).toEqual({
        id: 1, nickname: 'testuser', role: UserRole.USER,
      });
      expect(mockRefreshTokenRepo.remove).toHaveBeenCalledWith(mockTokenEntity);
    });

    it('존재하지 않는 토큰이면 UnauthorizedException을 던져야 한다', async () => {
      mockRefreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('nonexistent-token'))
        .rejects.toThrow(new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.'));
    });

    it('만료된 토큰이면 삭제 후 UnauthorizedException을 던져야 한다', async () => {
      const expiredToken = {
        ...mockTokenEntity,
        expiresAt: new Date(Date.now() - 1000),
      };
      mockRefreshTokenRepo.findOne.mockResolvedValue(expiredToken);
      mockRefreshTokenRepo.remove.mockResolvedValue(expiredToken);

      await expect(service.refreshTokens('valid-refresh-token'))
        .rejects.toThrow(new UnauthorizedException('만료된 리프레시 토큰입니다.'));
      expect(mockRefreshTokenRepo.remove).toHaveBeenCalledWith(expiredToken);
    });

    it('SUSPENDED 사용자의 토큰이면 삭제 후 UnauthorizedException을 던져야 한다', async () => {
      mockRefreshTokenRepo.findOne.mockResolvedValue(mockTokenEntity);
      mockUsersService.findByIdWithStatus.mockResolvedValue({
        id: 1, nickname: 'testuser', status: UserStatus.SUSPENDED, role: UserRole.USER,
      });
      mockRefreshTokenRepo.remove.mockResolvedValue(mockTokenEntity);

      await expect(service.refreshTokens('valid-refresh-token'))
        .rejects.toThrow(new UnauthorizedException('정지된 계정입니다.'));
    });

    it('DELETED 사용자의 토큰이면 삭제 후 UnauthorizedException을 던져야 한다', async () => {
      mockRefreshTokenRepo.findOne.mockResolvedValue(mockTokenEntity);
      mockUsersService.findByIdWithStatus.mockResolvedValue({
        id: 1, nickname: 'testuser', status: UserStatus.DELETED, role: UserRole.USER,
      });
      mockRefreshTokenRepo.remove.mockResolvedValue(mockTokenEntity);

      await expect(service.refreshTokens('valid-refresh-token'))
        .rejects.toThrow(new UnauthorizedException('탈퇴한 계정입니다.'));
    });
  });

  describe('revokeRefreshToken', () => {
    it('해당 토큰을 삭제해야 한다', async () => {
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 1 });

      await service.revokeRefreshToken('some-token');

      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({ token: 'some-token' });
    });
  });

  describe('revokeAllUserTokens', () => {
    it('해당 유저의 모든 토큰을 삭제해야 한다', async () => {
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 3 });

      await service.revokeAllUserTokens(1);

      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 1 });
    });
  });

  describe('login', () => {
    it('access_token, refresh_token, 사용자 정보를 반환해야 한다', async () => {
      const mockUser = {
        id: 1, nickname: 'testuser', email: 'test@example.com',
        password: 'hashedpassword', status: UserStatus.ACTIVE, role: UserRole.USER,
      };
      const loginDto = { email: 'test@example.com', password: 'password123' };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('mocked.jwt.token');
      mockRefreshTokenRepo.create.mockImplementation((data: Partial<RefreshToken>) => data);
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        nickname: mockUser.nickname, sub: mockUser.id, role: UserRole.USER,
      });
      expect(result.access_token).toBe('mocked.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(typeof result.refresh_token).toBe('string');
      expect(result.user).toEqual({
        id: 1, nickname: 'testuser', email: 'test@example.com', role: UserRole.USER,
      });
    });
  });

  describe('register', () => {
    it('사용자를 생성하고 access_token, refresh_token, 사용자 정보를 반환해야 한다', async () => {
      const createUserDto = { nickname: 'newuser', email: 'new@example.com', password: 'password123' };
      const createdUser = {
        id: 2, nickname: 'newuser', email: 'new@example.com',
        status: UserStatus.ACTIVE, role: UserRole.USER,
      };

      mockUsersService.create.mockResolvedValue(createdUser);
      mockJwtService.sign.mockReturnValue('new.jwt.token');
      mockRefreshTokenRepo.create.mockImplementation((data: Partial<RefreshToken>) => data);
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.register(createUserDto);

      expect(mockUsersService.create).toHaveBeenCalledWith(createUserDto);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        nickname: createdUser.nickname, sub: createdUser.id, role: UserRole.USER,
      });
      expect(result.access_token).toBe('new.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(typeof result.refresh_token).toBe('string');
      expect(result.user).toEqual({
        id: 2, nickname: 'newuser', email: 'new@example.com', role: UserRole.USER,
      });
    });
  });
});
