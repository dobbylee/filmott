import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AuthProvider } from '../users/enums/auth-provider.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { RefreshToken } from './entities/refresh-token.entity';
import { SocialProfile } from './interfaces/social-profile.interface';
import { DataSource, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findByProvider: jest.fn(),
    create: jest.fn(),
    createSocialUser: jest.fn(),
    findByIdWithStatus: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockRefreshTokenRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepo,
        },
        { provide: DataSource, useValue: mockDataSource },
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
        id: 1,
        nickname: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result).toEqual({
        id: 1,
        nickname: 'testuser',
        email: 'test@example.com',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'password123',
        'hashedpassword',
      );
    });

    it('비밀번호가 일치하지 않으면 UnauthorizedException을 던져야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateUser('test@example.com', 'wrongpass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('사용자를 찾을 수 없으면 UnauthorizedException을 던져야 한다', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateUser('notfound@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('DELETED 사용자에 대해 메시지와 함께 UnauthorizedException을 던져야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'deleted_1_123',
        email: 'deleted_1_123@deleted.local',
        password: 'hashedpassword',
        status: UserStatus.DELETED,
        role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.validateUser('deleted_1_123@deleted.local', 'password123'),
      ).rejects.toThrow(new UnauthorizedException('탈퇴한 계정입니다.'));
    });

    it('SUSPENDED 사용자에 대해 메시지와 함께 UnauthorizedException을 던져야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        status: UserStatus.SUSPENDED,
        role: UserRole.USER,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(new UnauthorizedException('정지된 계정입니다.'));
    });
  });

  describe('generateTokens', () => {
    it('access_token과 refresh_token을 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'testuser', role: UserRole.USER };
      mockJwtService.sign.mockReturnValue('mocked.jwt.token');
      mockRefreshTokenRepo.create.mockReturnValue({
        token: 'mock-refresh',
        userId: 1,
      });
      mockRefreshTokenRepo.save.mockResolvedValue({
        token: 'mock-refresh',
        userId: 1,
      });

      const result = await service.generateTokens(user);

      expect(result.access_token).toBe('mocked.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(typeof result.refresh_token).toBe('string');
      expect(result.refresh_token.length).toBe(64);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        nickname: 'testuser',
        sub: 1,
        role: UserRole.USER,
      });
    });

    it('refresh token의 SHA-256 해시를 DB에 저장해야 한다', async () => {
      const user = { id: 1, nickname: 'testuser', role: UserRole.USER };
      mockJwtService.sign.mockReturnValue('mocked.jwt.token');
      mockRefreshTokenRepo.create.mockImplementation(
        (data: Partial<RefreshToken>) => data,
      );
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.generateTokens(user);

      expect(mockRefreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
      expect(mockRefreshTokenRepo.save).toHaveBeenCalled();

      // DB에 저장된 토큰은 반환된 rawToken의 SHA-256 해시여야 한다
      const createArg = mockRefreshTokenRepo.create.mock.calls[0][0] as {
        token: string;
        expiresAt: Date;
      };
      const expectedHash = createHash('sha256')
        .update(result.refresh_token)
        .digest('hex');
      expect(createArg.token).toBe(expectedHash);
      expect(createArg.token).not.toBe(result.refresh_token);

      const now = new Date();
      const daysDiff =
        (createArg.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThan(6.9);
      expect(daysDiff).toBeLessThan(7.1);
    });
  });

  describe('refreshTokens', () => {
    it('정상적으로 트랜잭션 내에서 토큰을 rotation하고 새 토큰 쌍을 반환해야 한다', async () => {
      const rawToken = 'valid-refresh-token';
      const hashedToken = createHash('sha256').update(rawToken).digest('hex');
      const mockTokenEntity = {
        id: 1,
        token: hashedToken,
        userId: 1,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockTokenEntity),
        remove: jest.fn().mockResolvedValue(mockTokenEntity),
        create: jest
          .fn()
          .mockImplementation(
            (_entity: unknown, data: Partial<RefreshToken>) => data,
          ),
        save: jest.fn().mockResolvedValue({}),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockUsersService.findByIdWithStatus.mockResolvedValue({
        id: 1,
        nickname: 'testuser',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
        profileImage: null,
        subscribedOtts: [],
      });
      mockJwtService.sign.mockReturnValue('new.jwt.token');

      const result = await service.refreshTokens(rawToken);

      expect(result.access_token).toBe('new.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(result.refresh_token.length).toBe(64);
      expect(result.user).toEqual({
        id: 1,
        nickname: 'testuser',
        role: UserRole.USER,
        profileImage: null,
        subscribedOtts: [],
      });
      // 트랜잭션이 사용되었는지 확인
      expect(mockDataSource.transaction).toHaveBeenCalled();
      // 해시된 토큰으로 조회했는지 확인
      expect(mockManager.findOne).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({
          where: { token: hashedToken },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      // 기존 토큰 삭제 확인
      expect(mockManager.remove).toHaveBeenCalledWith(mockTokenEntity);
      // 새 토큰이 manager를 통해 저장되었는지 확인
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('존재하지 않는 토큰이면 UnauthorizedException을 던져야 한다', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );

      await expect(service.refreshTokens('nonexistent-token')).rejects.toThrow(
        new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.'),
      );
    });

    it('만료된 토큰이면 삭제 후 UnauthorizedException을 던져야 한다', async () => {
      const rawToken = 'expired-token';
      const hashedToken = createHash('sha256').update(rawToken).digest('hex');
      const expiredTokenEntity = {
        id: 1,
        token: hashedToken,
        userId: 1,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(expiredTokenEntity),
        remove: jest.fn().mockResolvedValue(expiredTokenEntity),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        new UnauthorizedException('만료된 리프레시 토큰입니다.'),
      );
      expect(mockManager.remove).toHaveBeenCalledWith(expiredTokenEntity);
    });

    it('SUSPENDED 사용자의 토큰이면 삭제 후 UnauthorizedException을 던져야 한다', async () => {
      const rawToken = 'suspended-user-token';
      const hashedToken = createHash('sha256').update(rawToken).digest('hex');
      const mockTokenEntity = {
        id: 1,
        token: hashedToken,
        userId: 1,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockTokenEntity),
        remove: jest.fn().mockResolvedValue(mockTokenEntity),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockUsersService.findByIdWithStatus.mockResolvedValue({
        id: 1,
        nickname: 'testuser',
        status: UserStatus.SUSPENDED,
        role: UserRole.USER,
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        new UnauthorizedException('정지된 계정입니다.'),
      );
    });

    it('DELETED 사용자의 토큰이면 삭제 후 UnauthorizedException을 던져야 한다', async () => {
      const rawToken = 'deleted-user-token';
      const hashedToken = createHash('sha256').update(rawToken).digest('hex');
      const mockTokenEntity = {
        id: 1,
        token: hashedToken,
        userId: 1,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockTokenEntity),
        remove: jest.fn().mockResolvedValue(mockTokenEntity),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockUsersService.findByIdWithStatus.mockResolvedValue({
        id: 1,
        nickname: 'testuser',
        status: UserStatus.DELETED,
        role: UserRole.USER,
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(
        new UnauthorizedException('탈퇴한 계정입니다.'),
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('해시된 토큰으로 삭제해야 한다', async () => {
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 1 });
      const rawToken = 'some-token';
      const expectedHash = createHash('sha256').update(rawToken).digest('hex');

      await service.revokeRefreshToken(rawToken);

      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({
        token: expectedHash,
      });
    });
  });

  describe('revokeAllUserTokens', () => {
    it('해당 유저의 모든 토큰을 삭제해야 한다', async () => {
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 3 });

      await service.revokeAllUserTokens(1);

      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 1 });
    });
  });

  describe('cleanExpiredTokens', () => {
    it('만료된 토큰을 삭제해야 한다', async () => {
      const mockQb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      mockRefreshTokenRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.cleanExpiredTokens();

      expect(mockRefreshTokenRepo.createQueryBuilder).toHaveBeenCalledWith(
        'rt',
      );
      expect(mockQb.delete).toHaveBeenCalled();
      expect(mockQb.where).toHaveBeenCalledWith('expires_at < :now', {
        now: expect.any(Date),
      });
      expect(mockQb.execute).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('ADMIN은 이메일 로그인이 가능해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'adminuser',
        email: 'admin@example.com',
        password: 'hashedpassword',
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
      };
      const loginDto = { email: 'admin@example.com', password: 'password123' };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('mocked.jwt.token');
      mockRefreshTokenRepo.create.mockImplementation(
        (data: Partial<RefreshToken>) => data,
      );
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        nickname: mockUser.nickname,
        sub: mockUser.id,
        role: UserRole.ADMIN,
      });
      expect(result.access_token).toBe('mocked.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(result.user).toEqual({
        id: 1,
        nickname: 'adminuser',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        profileImage: null,
        subscribedOtts: [],
      });
    });

    it('일반 USER가 이메일 로그인 시도하면 UnauthorizedException을 던져야 한다', async () => {
      const mockUser = {
        id: 2,
        nickname: 'normaluser',
        email: 'user@example.com',
        password: 'hashedpassword',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      const loginDto = { email: 'user@example.com', password: 'password123' };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('소셜 로그인을 이용해주세요.'),
      );
    });
  });

  describe('handleSocialCallback', () => {
    const googleProfile: SocialProfile = {
      provider: AuthProvider.GOOGLE,
      providerId: 'google-123',
      email: 'user@gmail.com',
      nickname: 'Google User',
      profileImage: 'http://google.com/photo.jpg',
    };

    it('기존 유저가 있으면 즉시 세션을 반환해야 한다', async () => {
      const existingUser = {
        id: 1,
        nickname: 'existinguser',
        email: 'user@gmail.com',
        password: null,
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
        profileImage: null,
        subscribedOtts: [],
      };
      mockUsersService.findByProvider.mockResolvedValue(existingUser);
      mockJwtService.sign.mockReturnValue('access.token');
      mockRefreshTokenRepo.create.mockImplementation(
        (data: Partial<RefreshToken>) => data,
      );
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.handleSocialCallback(googleProfile);

      expect(result.type).toBe('existing');
      if (result.type === 'existing') {
        expect(result.session.access_token).toBe('access.token');
        expect(result.session.refresh_token).toHaveLength(64);
        expect(result.session.user).toEqual({
          id: 1,
          nickname: 'existinguser',
          email: 'user@gmail.com',
          role: UserRole.USER,
          profileImage: null,
          subscribedOtts: [],
        });
      }
      expect(mockUsersService.findByProvider).toHaveBeenCalledWith(
        AuthProvider.GOOGLE,
        'google-123',
      );
    });

    it('신규 유저면 signupToken을 반환해야 한다', async () => {
      mockUsersService.findByProvider.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue('temp.jwt.token');

      const result = await service.handleSocialCallback(googleProfile);

      expect(result.type).toBe('new');
      if (result.type === 'new') {
        expect(result.signupToken).toBe('temp.jwt.token');
      }
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        {
          provider: AuthProvider.GOOGLE,
          providerId: 'google-123',
          email: 'user@gmail.com',
          nickname: 'Google User',
          profileImage: 'http://google.com/photo.jpg',
          type: 'social_signup',
        },
        { expiresIn: '5m' },
      );
    });

    it('SUSPENDED 기존 유저면 UnauthorizedException을 던져야 한다', async () => {
      const suspendedUser = {
        id: 1,
        nickname: 'suspended',
        email: 'user@gmail.com',
        password: null,
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        status: UserStatus.SUSPENDED,
        role: UserRole.USER,
      };
      mockUsersService.findByProvider.mockResolvedValue(suspendedUser);

      await expect(service.handleSocialCallback(googleProfile)).rejects.toThrow(
        new UnauthorizedException('정지된 계정입니다.'),
      );
    });

    it('DELETED 기존 유저면 UnauthorizedException을 던져야 한다', async () => {
      const deletedUser = {
        id: 1,
        nickname: 'deleted_1_123',
        email: 'deleted_1_123@deleted.local',
        password: null,
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        status: UserStatus.DELETED,
        role: UserRole.USER,
      };
      mockUsersService.findByProvider.mockResolvedValue(deletedUser);

      await expect(service.handleSocialCallback(googleProfile)).rejects.toThrow(
        new UnauthorizedException('탈퇴한 계정입니다.'),
      );
    });
  });

  describe('completeSocialSignup', () => {
    it('정상적으로 유저를 생성하고 토큰을 반환해야 한다', async () => {
      const mockPayload = {
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        email: 'user@gmail.com',
        nickname: 'Google User',
        profileImage: null,
        type: 'social_signup',
      };
      mockJwtService.verify.mockReturnValue(mockPayload);
      mockUsersService.findByProvider.mockResolvedValue(null);

      const createdUser = {
        id: 1,
        nickname: 'mynickname',
        email: 'user@gmail.com',
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersService.createSocialUser.mockResolvedValue(createdUser);
      mockJwtService.sign.mockReturnValue('access.token');
      mockRefreshTokenRepo.create.mockImplementation(
        (data: Partial<RefreshToken>) => data,
      );
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.completeSocialSignup(
        'valid-temp-token',
        'mynickname',
      );

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-temp-token');
      expect(mockUsersService.createSocialUser).toHaveBeenCalledWith({
        nickname: 'mynickname',
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        email: 'user@gmail.com',
        profileImage: null,
        subscribedOtts: [],
      });
      expect(result.access_token).toBe('access.token');
      expect(result.user.nickname).toBe('mynickname');
    });

    it('만료된 tempToken이면 BadRequestException을 던져야 한다', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.completeSocialSignup('expired-token', 'nickname'),
      ).rejects.toThrow(BadRequestException);
    });

    it('유효하지 않은 토큰 타입이면 BadRequestException을 던져야 한다', async () => {
      mockJwtService.verify.mockReturnValue({
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        email: 'user@gmail.com',
        nickname: null,
        profileImage: null,
        type: 'wrong_type',
      });

      await expect(
        service.completeSocialSignup('wrong-type-token', 'nickname'),
      ).rejects.toThrow(
        new BadRequestException('유효하지 않은 토큰 타입입니다.'),
      );
    });

    it('subscribedOtts를 포함하여 유저를 생성해야 한다', async () => {
      const mockPayload = {
        provider: AuthProvider.GOOGLE,
        providerId: 'google-ott',
        email: 'ott@gmail.com',
        nickname: 'Google OTT User',
        profileImage: null,
        type: 'social_signup',
      };
      mockJwtService.verify.mockReturnValue(mockPayload);
      mockUsersService.findByProvider.mockResolvedValue(null);

      const createdUser = {
        id: 10,
        nickname: 'ottuser',
        email: 'ott@gmail.com',
        provider: AuthProvider.GOOGLE,
        providerId: 'google-ott',
        subscribedOtts: ['netflix', 'tving'],
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersService.createSocialUser.mockResolvedValue(createdUser);
      mockJwtService.sign.mockReturnValue('access.token');
      mockRefreshTokenRepo.create.mockImplementation(
        (data: Partial<RefreshToken>) => data,
      );
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.completeSocialSignup(
        'valid-temp-token',
        'ottuser',
        ['netflix', 'tving'],
      );

      expect(mockUsersService.createSocialUser).toHaveBeenCalledWith(
        expect.objectContaining({
          subscribedOtts: ['netflix', 'tving'],
        }),
      );
      expect(result.user.subscribedOtts).toEqual(['netflix', 'tving']);
    });

    it('subscribedOtts가 없으면 빈 배열로 전달해야 한다', async () => {
      const mockPayload = {
        provider: AuthProvider.GOOGLE,
        providerId: 'google-no-ott',
        email: 'noott@gmail.com',
        nickname: 'No OTT User',
        profileImage: null,
        type: 'social_signup',
      };
      mockJwtService.verify.mockReturnValue(mockPayload);
      mockUsersService.findByProvider.mockResolvedValue(null);

      const createdUser = {
        id: 11,
        nickname: 'noottuser',
        email: 'noott@gmail.com',
        provider: AuthProvider.GOOGLE,
        providerId: 'google-no-ott',
        subscribedOtts: [],
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersService.createSocialUser.mockResolvedValue(createdUser);
      mockJwtService.sign.mockReturnValue('access.token');
      mockRefreshTokenRepo.create.mockImplementation(
        (data: Partial<RefreshToken>) => data,
      );
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.completeSocialSignup(
        'valid-temp-token',
        'noottuser',
      );

      expect(mockUsersService.createSocialUser).toHaveBeenCalledWith(
        expect.objectContaining({
          subscribedOtts: [],
        }),
      );
      expect(result.user.subscribedOtts).toEqual([]);
    });

    it('P1-6: 이미 가입된 소셜 계정이면 ConflictException을 던져야 한다', async () => {
      const mockPayload = {
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        email: 'user@gmail.com',
        nickname: 'Google User',
        profileImage: null,
        type: 'social_signup',
      };
      mockJwtService.verify.mockReturnValue(mockPayload);
      mockUsersService.findByProvider.mockResolvedValue({
        id: 1,
        nickname: 'existinguser',
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
      });

      await expect(
        service.completeSocialSignup('reused-temp-token', 'newnickname'),
      ).rejects.toThrow(new ConflictException('이미 가입된 소셜 계정입니다.'));
    });
  });

  describe('register', () => {
    it('사용자를 생성하고 access_token, refresh_token, 사용자 정보를 반환해야 한다', async () => {
      const createUserDto = {
        nickname: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      };
      const createdUser = {
        id: 2,
        nickname: 'newuser',
        email: 'new@example.com',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };

      mockUsersService.create.mockResolvedValue(createdUser);
      mockJwtService.sign.mockReturnValue('new.jwt.token');
      mockRefreshTokenRepo.create.mockImplementation(
        (data: Partial<RefreshToken>) => data,
      );
      mockRefreshTokenRepo.save.mockResolvedValue({});

      const result = await service.register(createUserDto);

      expect(mockUsersService.create).toHaveBeenCalledWith(createUserDto);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        nickname: createdUser.nickname,
        sub: createdUser.id,
        role: UserRole.USER,
      });
      expect(result.access_token).toBe('new.jwt.token');
      expect(result.refresh_token).toBeDefined();
      expect(typeof result.refresh_token).toBe('string');
      expect(result.user).toEqual({
        id: 2,
        nickname: 'newuser',
        email: 'new@example.com',
        role: UserRole.USER,
        profileImage: null,
        subscribedOtts: [],
      });
    });
  });
});
