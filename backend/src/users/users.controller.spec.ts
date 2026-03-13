import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findById: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    isNicknameAvailable: jest.fn(),
    verifyPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
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

      expect(mockUsersService.isNicknameAvailable).toHaveBeenCalledWith('newuser');
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
      const mockUser = { id: 1, nickname: 'test' };
      mockUsersService.verifyPassword.mockResolvedValue(true);

      const result = await controller.verifyPassword(mockUser, 'correct!Password1');

      expect(mockUsersService.verifyPassword).toHaveBeenCalledWith(1, 'correct!Password1');
      expect(result).toEqual({ verified: true });
    });

    it('비밀번호가 비어있으면 BadRequestException을 던져야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test' };

      await expect(controller.verifyPassword(mockUser, '')).rejects.toThrow(BadRequestException);
      expect(mockUsersService.verifyPassword).not.toHaveBeenCalled();
    });

    it('비밀번호가 undefined이면 BadRequestException을 던져야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test' };

      await expect(controller.verifyPassword(mockUser, undefined as any)).rejects.toThrow(BadRequestException);
    });

    it('비밀번호가 틀리면 BadRequestException을 던져야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test' };
      mockUsersService.verifyPassword.mockResolvedValue(false);

      await expect(controller.verifyPassword(mockUser, 'wrong!Pass1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /users/me (getProfile)', () => {
    it('현재 사용자 프로필을 반환해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test' };
      const profile = { id: 1, nickname: 'test', email: 'test@test.com' };
      mockUsersService.findById.mockResolvedValue(profile);

      const result = await controller.getProfile(mockUser);

      expect(mockUsersService.findById).toHaveBeenCalledWith(1);
      expect(result).toEqual(profile);
    });

    it('사용자를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      const mockUser = { id: 999, nickname: 'ghost' };
      mockUsersService.findById.mockResolvedValue(null);

      await expect(controller.getProfile(mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /users/me (update)', () => {
    it('업데이트하고 수정된 사용자를 반환해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test' };
      const dto = { nickname: 'newname' };
      const updated = { id: 1, nickname: 'newname', email: 'test@test.com' };
      mockUsersService.update.mockResolvedValue(updated);

      const result = await controller.update(mockUser, dto);

      expect(mockUsersService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('DELETE /users/me (deactivate)', () => {
    it('현재 사용자 ID로 deactivate를 호출해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test' };
      mockUsersService.deactivate.mockResolvedValue(undefined);

      await controller.deactivate(mockUser);

      expect(mockUsersService.deactivate).toHaveBeenCalledWith(1);
    });
  });
});
