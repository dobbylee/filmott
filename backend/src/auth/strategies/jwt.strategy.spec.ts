import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UserRole } from '../../users/enums/user-role.enum';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: { findByIdWithStatus: jest.Mock };

  beforeEach(async () => {
    usersService = {
      findByIdWithStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  const payload = { sub: 1, nickname: 'testuser', role: 'USER' };

  describe('validate', () => {
    it('ACTIVE 유저는 정상적으로 id, nickname, role을 반환해야 한다', async () => {
      usersService.findByIdWithStatus.mockResolvedValue({
        id: 1,
        nickname: 'testuser',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      });

      const result = await strategy.validate(payload);

      expect(usersService.findByIdWithStatus).toHaveBeenCalledWith(1);
      expect(result).toEqual({
        id: 1,
        nickname: 'testuser',
        role: UserRole.USER,
      });
    });

    it('DB에서 가져온 최신 role을 반환해야 한다 (JWT payload의 stale role 방지)', async () => {
      usersService.findByIdWithStatus.mockResolvedValue({
        id: 1,
        nickname: 'adminuser',
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
      });

      const result = await strategy.validate({
        sub: 1,
        nickname: 'adminuser',
        role: 'USER', // JWT에는 USER로 되어 있지만
      });

      expect(result.role).toBe(UserRole.ADMIN); // DB에서 최신 role 반환
    });

    it('SUSPENDED 유저는 UnauthorizedException을 던져야 한다', async () => {
      usersService.findByIdWithStatus.mockResolvedValue({
        id: 2,
        nickname: 'suspended',
        status: UserStatus.SUSPENDED,
        role: UserRole.USER,
      });

      await expect(
        strategy.validate({ sub: 2, nickname: 'suspended' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('DELETED 유저는 UnauthorizedException을 던져야 한다', async () => {
      usersService.findByIdWithStatus.mockResolvedValue({
        id: 3,
        nickname: 'deleted',
        status: UserStatus.DELETED,
        role: UserRole.USER,
      });

      await expect(
        strategy.validate({ sub: 3, nickname: 'deleted' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('존재하지 않는 유저는 UnauthorizedException을 던져야 한다', async () => {
      usersService.findByIdWithStatus.mockResolvedValue(null);

      await expect(
        strategy.validate({ sub: 999, nickname: 'ghost' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
