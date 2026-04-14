import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findById: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    isNicknameAvailable: jest.fn(),
    verifyPassword: jest.fn(),
    findAllForAdmin: jest.fn(),
    updateStatusByAdmin: jest.fn(),
    updateProfileImage: jest.fn(),
    removeProfileImage: jest.fn(),
    getPublicProfile: jest.fn(),
    updateSubscribedOtts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /users/check-nickname/:nickname (checkNickname)', () => {
    it('닉네임이 사용 가능하면 available: true를 반환해야 한다', async () => {
      mockUsersService.isNicknameAvailable.mockResolvedValue(true);

      const result = await controller.checkNickname('newuser');

      expect(mockUsersService.isNicknameAvailable).toHaveBeenCalledWith(
        'newuser',
      );
      expect(result).toEqual({ available: true });
    });

    it('닉네임이 이미 사용 중이면 available: false를 반환해야 한다', async () => {
      mockUsersService.isNicknameAvailable.mockResolvedValue(false);

      const result = await controller.checkNickname('takenuser');

      expect(result).toEqual({ available: false });
    });

    it('checkNickname에 ThrottlerGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.checkNickname,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(ThrottlerGuard);
    });
  });

  describe('POST /users/me/verify-password (verifyPassword)', () => {
    it('비밀번호가 올바르면 verified: true를 반환해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };
      mockUsersService.verifyPassword.mockResolvedValue(true);

      const result = await controller.verifyPassword(
        mockUser,
        'correct!Password1',
      );

      expect(mockUsersService.verifyPassword).toHaveBeenCalledWith(
        1,
        'correct!Password1',
      );
      expect(result).toEqual({ verified: true });
    });

    it('비밀번호가 비어있으면 BadRequestException을 던져야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };

      await expect(controller.verifyPassword(mockUser, '')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockUsersService.verifyPassword).not.toHaveBeenCalled();
    });

    it('비밀번호가 undefined이면 BadRequestException을 던져야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };

      await expect(
        controller.verifyPassword(mockUser, undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('비밀번호가 틀리면 BadRequestException을 던져야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };
      mockUsersService.verifyPassword.mockResolvedValue(false);

      await expect(
        controller.verifyPassword(mockUser, 'wrong!Pass1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /users/me (getProfile)', () => {
    it('현재 사용자 프로필을 반환해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };
      const profile = { id: 1, nickname: 'test', email: 'test@test.com' };
      mockUsersService.findById.mockResolvedValue(profile);

      const result = await controller.getProfile(mockUser);

      expect(mockUsersService.findById).toHaveBeenCalledWith(1);
      expect(result).toEqual(profile);
    });

    it('사용자를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      const mockUser = { id: 999, nickname: 'ghost', role: 'USER' };
      mockUsersService.findById.mockResolvedValue(null);

      await expect(controller.getProfile(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PATCH /users/me/otts (updateOtts)', () => {
    it('OTT 구독 정보를 업데이트하고 결과를 반환해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };
      const mockResult = {
        id: 1,
        nickname: 'test',
        subscribedOtts: ['netflix', 'tving'],
      };
      mockUsersService.updateSubscribedOtts.mockResolvedValue(mockResult);

      const result = await controller.updateOtts(mockUser, {
        otts: ['netflix', 'tving'],
      });

      expect(mockUsersService.updateSubscribedOtts).toHaveBeenCalledWith(1, [
        'netflix',
        'tving',
      ]);
      expect(result).toEqual(mockResult);
    });

    it('JwtAuthGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.updateOtts,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
    });
  });

  describe('GET /users/admin (getAdminUsers)', () => {
    it('JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.getAdminUsers,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
      expect(guards).toContainEqual(RolesGuard);
    });

    it('ADMIN 역할이 필요해야 한다', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        UsersController.prototype.getAdminUsers,
      );
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });

  describe('POST /users/me/profile-image (uploadProfileImage)', () => {
    it('파일이 없으면 BadRequestException을 던져야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };

      await expect(
        controller.uploadProfileImage(
          mockUser,
          undefined as unknown as Express.Multer.File,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('파일이 있으면 updateProfileImage를 호출하고 결과를 반환해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };
      const mockFile = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;
      const mockResult = {
        id: 1,
        nickname: 'test',
        profileImage: 'https://test.r2.dev/profiles/test.webp',
      };
      mockUsersService.updateProfileImage.mockResolvedValue(mockResult);

      const result = await controller.uploadProfileImage(mockUser, mockFile);

      expect(mockUsersService.updateProfileImage).toHaveBeenCalledWith(
        1,
        mockFile,
      );
      expect(result).toEqual(mockResult);
    });

    it('JwtAuthGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.uploadProfileImage,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
    });
  });

  describe('DELETE /users/me/profile-image (deleteProfileImage)', () => {
    it('removeProfileImage를 호출하고 결과를 반환해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', role: 'USER' };
      const mockResult = { id: 1, nickname: 'test', profileImage: undefined };
      mockUsersService.removeProfileImage.mockResolvedValue(mockResult);

      const result = await controller.deleteProfileImage(mockUser);

      expect(mockUsersService.removeProfileImage).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockResult);
    });

    it('JwtAuthGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.deleteProfileImage,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
    });
  });

  describe('PATCH /users/admin/:id/status (updateUserStatus)', () => {
    it('JwtAuthGuard와 RolesGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.updateUserStatus,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(JwtAuthGuard);
      expect(guards).toContainEqual(RolesGuard);
    });

    it('ADMIN 역할이 필요해야 한다', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        UsersController.prototype.updateUserStatus,
      );
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });

  describe('GET /users/:id/profile (getPublicProfile)', () => {
    it('공개 프로필을 반환해야 한다', async () => {
      const mockProfile = {
        id: 1,
        nickname: 'testuser',
        profileImage: null,
        createdAt: new Date('2025-01-01'),
        reviewCount: 5,
        watchedCount: 10,
        wantToWatchCount: 3,
      };
      mockUsersService.getPublicProfile.mockResolvedValue(mockProfile);

      const result = await controller.getPublicProfile(1);

      expect(mockUsersService.getPublicProfile).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockProfile);
    });

    it('존재하지 않는 유저이면 서비스에서 NotFoundException을 던져야 한다', async () => {
      mockUsersService.getPublicProfile.mockRejectedValue(
        new NotFoundException('사용자를 찾을 수 없습니다.'),
      );

      await expect(controller.getPublicProfile(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('인증 가드가 적용되지 않아야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.getPublicProfile,
      );
      // JwtAuthGuard가 포함되지 않아야 함
      expect(!guards || !guards.includes(JwtAuthGuard)).toBeTruthy();
    });

    it('ThrottlerGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController.prototype.getPublicProfile,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(ThrottlerGuard);
    });
  });
});
