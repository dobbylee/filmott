import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { User } from './user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { R2StorageService } from '../common/r2-storage.service';
import { AuthProvider } from './enums/auth-provider.enum';
import { UserStatus } from './enums/user-status.enum';
import { UserRole } from './enums/user-role.enum';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-image')),
  }));
  return { __esModule: true, default: mockSharp };
});

describe('UsersService', () => {
  let service: UsersService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockUsersRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockRefreshTokenRepo = {
    delete: jest.fn(),
  };

  const mockR2Storage = {
    upload: jest.fn(),
    delete: jest.fn(),
    getPublicUrl: jest.fn().mockReturnValue('https://test.r2.dev'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepo },
        { provide: R2StorageService, useValue: mockR2Storage },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('ACTIVE와 SUSPENDED를 포함하기 위해 Not(DELETED) 상태 조건으로 조회해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await service.findOne('test');

      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({
        where: { nickname: 'test', status: Not(UserStatus.DELETED) },
      });
    });
  });

  describe('findByEmail', () => {
    it('DELETED 유저를 제외하고 Not(DELETED) 조건으로 조회해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await service.findByEmail('test@test.com');

      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'test@test.com', status: Not(UserStatus.DELETED) },
      });
    });
  });

  describe('findByProvider', () => {
    it('provider와 providerId로 Not(DELETED) 조건으로 조회해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await service.findByProvider(AuthProvider.GOOGLE, 'google-123');

      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({
        where: {
          provider: AuthProvider.GOOGLE,
          providerId: 'google-123',
          status: Not(UserStatus.DELETED),
        },
      });
    });

    it('일치하는 사용자가 있으면 반환해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'socialuser',
        email: 'social@test.com',
        password: null,
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findByProvider(AuthProvider.GOOGLE, 'google-123');

      expect(result).toEqual(mockUser);
    });

    it('일치하는 사용자가 없으면 null을 반환해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      const result = await service.findByProvider(AuthProvider.KAKAO, 'kakao-999');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('사용자가 존재하면 비밀번호 없는 SafeUser를 반환해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        id: 1,
        nickname: 'test',
        email: 'test@test.com',
        password: 'hashed',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      });

      const result = await service.findById(1);

      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('password');
      expect(result!.nickname).toBe('test');
      expect(result!.status).toBe(UserStatus.ACTIVE);
      expect(result!.role).toBe(UserRole.USER);
    });

    it('사용자가 존재하지 않으면 null을 반환해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('닉네임이 이미 사용 중이면 ConflictException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce({ id: 1, nickname: 'existing' });

      await expect(service.create({ nickname: 'existing', email: 'test@test.com', password: 'password' }))
        .rejects.toThrow(ConflictException);
    });

    it('이메일이 이미 사용 중이면 ConflictException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(null); // nickname not found
      mockUsersRepo.findOne.mockResolvedValueOnce({ id: 1, email: 'taken@test.com' }); // email found

      await expect(service.create({ nickname: 'new', email: 'taken@test.com', password: 'password' }))
        .rejects.toThrow(ConflictException);
    });

    it('새 사용자를 성공적으로 생성하고 비밀번호 없이 반환해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedpass');
      mockUsersRepo.create.mockReturnValue({ nickname: 'test', email: 'test@test.com', password: 'hashedpass' });
      mockUsersRepo.save.mockResolvedValue({ id: 1, nickname: 'test', email: 'test@test.com', password: 'hashedpass' });

      const result = await service.create({ nickname: 'test', email: 'test@test.com', password: 'password' });

      expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
      expect(result).not.toHaveProperty('password');
      expect(result.nickname).toEqual('test');
    });
  });

  describe('createSocialUser', () => {
    it('소셜 유저를 생성하고 비밀번호 없이 반환해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null); // 닉네임 중복 없음
      mockUsersRepo.create.mockReturnValue({
        nickname: 'socialuser',
        email: 'social@test.com',
        password: null,
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
      });
      mockUsersRepo.save.mockResolvedValue({
        id: 1,
        nickname: 'socialuser',
        email: 'social@test.com',
        password: null,
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      });

      const result = await service.createSocialUser({
        nickname: 'socialuser',
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        email: 'social@test.com',
        profileImage: null,
      });

      expect(result).not.toHaveProperty('password');
      expect(result.nickname).toBe('socialuser');
      expect(result.provider).toBe(AuthProvider.GOOGLE);
      expect(mockUsersRepo.create).toHaveBeenCalledWith({
        nickname: 'socialuser',
        email: 'social@test.com',
        password: null,
        provider: AuthProvider.GOOGLE,
        providerId: 'google-123',
        profileImage: undefined,
      });
    });

    it('닉네임이 중복이면 ConflictException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 2, nickname: 'taken' });

      await expect(
        service.createSocialUser({
          nickname: 'taken',
          provider: AuthProvider.KAKAO,
          providerId: 'kakao-456',
          email: null,
          profileImage: null,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('예약어 닉네임이면 ConflictException을 던져야 한다', async () => {
      await expect(
        service.createSocialUser({
          nickname: 'admin123',
          provider: AuthProvider.NAVER,
          providerId: 'naver-789',
          email: 'test@naver.com',
          profileImage: null,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('이메일이 null인 소셜 유저(카카오)를 생성할 수 있어야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      mockUsersRepo.create.mockReturnValue({
        nickname: 'kakaouser',
        email: null,
        password: null,
        provider: AuthProvider.KAKAO,
        providerId: 'kakao-456',
      });
      mockUsersRepo.save.mockResolvedValue({
        id: 2,
        nickname: 'kakaouser',
        email: null,
        password: null,
        provider: AuthProvider.KAKAO,
        providerId: 'kakao-456',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      });

      const result = await service.createSocialUser({
        nickname: 'kakaouser',
        provider: AuthProvider.KAKAO,
        providerId: 'kakao-456',
        email: null,
        profileImage: 'http://profile.kakao.com/img.jpg',
      });

      expect(result.email).toBeNull();
      expect(result.provider).toBe(AuthProvider.KAKAO);
      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: null,
          password: null,
          profileImage: 'http://profile.kakao.com/img.jpg',
        }),
      );
    });
  });

  describe('update', () => {
    it('사용자를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      await expect(service.update(999, { nickname: 'changed' })).rejects.toThrow(NotFoundException);
    });

    it('currentPassword 없이 newPassword가 제공되면 BadRequestException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 1, nickname: 'test', password: 'hashed' });
      await expect(service.update(1, { newPassword: 'newpass12' })).rejects.toThrow(BadRequestException);
    });

    it('currentPassword가 틀리면 BadRequestException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 1, nickname: 'test', password: 'hashed' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.update(1, { currentPassword: 'wrongpass', newPassword: 'newpass12' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('새 닉네임이 이미 사용 중이면 ConflictException을 던져야 한다', async () => {
      mockUsersRepo.findOne
        .mockResolvedValueOnce({ id: 1, nickname: 'original', password: 'hashed' }) // findOne by id
        .mockResolvedValueOnce({ id: 2, nickname: 'taken' }); // findOne by new nickname

      await expect(
        service.update(1, { nickname: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });

    it('닉네임을 성공적으로 업데이트해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'original', email: 'test@test.com', password: 'hashed' };
      mockUsersRepo.findOne
        .mockResolvedValueOnce(mockUser) // findOne by id
        .mockResolvedValueOnce(null);   // findOne by new nickname (not taken)
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.update(1, { nickname: 'updated' });

      expect(result.nickname).toBe('updated');
      expect(result).not.toHaveProperty('password');
    });

    it('비밀번호를 성공적으로 업데이트해야 한다', async () => {
      const mockUser = { id: 1, nickname: 'test', email: 'test@test.com', password: 'oldhashed' };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newhashed');
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.update(1, {
        currentPassword: 'oldpass12',
        newPassword: 'newpass12',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('newpass12', 10);
      expect(result).not.toHaveProperty('password');
    });

    it('현재와 동일한 닉네임이면 업데이트를 건너뛰어야 한다', async () => {
      const mockUser = { id: 1, nickname: 'same', email: 'test@test.com', password: 'hashed' };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.update(1, { nickname: 'same' });

      // findOne for nickname conflict check should NOT be called (same nickname)
      expect(mockUsersRepo.findOne).toHaveBeenCalledTimes(1);
      expect(result.nickname).toBe('same');
    });
  });

  describe('verifyPassword', () => {
    it('ACTIVE가 아닌 사용자에 대해 false를 반환해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        id: 1,
        password: 'hashed',
        status: UserStatus.DELETED,
      });

      const result = await service.verifyPassword(1, 'password');

      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('ACTIVE 사용자의 비밀번호를 검증해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        id: 1,
        password: 'hashed',
        status: UserStatus.ACTIVE,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyPassword(1, 'password');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashed');
    });
  });

  describe('deactivate', () => {
    it('사용자를 익명화하고 상태를 DELETED로 설정해야 한다', async () => {
      const mockUser: Record<string, unknown> = {
        id: 5,
        nickname: 'bob',
        email: 'bob@mail.com',
        providerId: 'google-123',
        status: UserStatus.ACTIVE,
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 2 });

      // Mock Date.now() for predictable timestamp
      const fixedTimestamp = 1740000000000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp);

      await service.deactivate(5);

      // Should anonymize user data, set status to DELETED, and save
      expect(mockUser.nickname).toEqual(`deleted_5_${fixedTimestamp}`);
      expect(mockUser.email).toEqual(`deleted_5_${fixedTimestamp}@deleted.local`);
      expect(mockUser.providerId).toBeNull();
      expect(mockUser.status).toEqual(UserStatus.DELETED);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(mockUser);

      jest.restoreAllMocks();
    });

    it('P0-2: 탈퇴 시 providerId를 null로 초기화해야 한다 (소셜 재가입 허용)', async () => {
      const mockUser: Record<string, unknown> = {
        id: 10,
        nickname: 'socialuser',
        email: 'social@mail.com',
        provider: AuthProvider.GOOGLE,
        providerId: 'google-abc',
        status: UserStatus.ACTIVE,
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 0 });

      const fixedTimestamp = 1740000000000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp);

      await service.deactivate(10);

      expect(mockUser.providerId).toBeNull();
      expect(mockUser.status).toEqual(UserStatus.DELETED);

      jest.restoreAllMocks();
    });

    it('탈퇴 시 해당 유저의 모든 refresh token을 삭제해야 한다', async () => {
      const mockUser: Record<string, unknown> = {
        id: 7,
        nickname: 'alice',
        email: 'alice@mail.com',
        status: UserStatus.ACTIVE,
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 3 });

      const fixedTimestamp = 1740000000000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp);

      await service.deactivate(7);

      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 7 });

      jest.restoreAllMocks();
    });

    it('사용자가 존재하지 않으면 NotFoundException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.deactivate(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllForAdmin', () => {
    const mockUsers = [
      {
        id: 1,
        nickname: 'user1',
        email: 'user1@test.com',
        provider: AuthProvider.LOCAL,
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
        createdAt: new Date(),
      },
      {
        id: 2,
        nickname: 'user2',
        email: 'user2@test.com',
        provider: AuthProvider.GOOGLE,
        status: UserStatus.SUSPENDED,
        role: UserRole.USER,
        createdAt: new Date(),
      },
    ];

    it('페이지네이션이 정상 동작해야 한다', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockUsers, 25]);

      const result = await service.findAllForAdmin({ page: '2', limit: '10' });

      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
      expect(result.total).toBe(25);
      expect(result.users).toEqual(mockUsers);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('기본 페이지와 limit을 사용해야 한다', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockUsers, 2]);

      const result = await service.findAllForAdmin({});

      expect(result.page).toBe(1);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('검색 조건이 있으면 ILIKE 조건을 추가해야 한다', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllForAdmin({ search: 'test' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.nickname ILIKE :search OR user.email ILIKE :search)',
        { search: '%test%' },
      );
    });

    it('P1-1: 검색어의 %와 _를 이스케이프해야 한다', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllForAdmin({ search: '100%_test' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.nickname ILIKE :search OR user.email ILIKE :search)',
        { search: '%100\\%\\_test%' },
      );
    });

    it('P1-1: 검색어의 백슬래시를 이스케이프해야 한다', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllForAdmin({ search: 'a\\b' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.nickname ILIKE :search OR user.email ILIKE :search)',
        { search: '%a\\\\b%' },
      );
    });

    it('상태 필터가 있으면 status 조건을 추가해야 한다', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllForAdmin({ status: UserStatus.SUSPENDED });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.status = :status',
        { status: UserStatus.SUSPENDED },
      );
    });

    it('limit이 100을 초과하면 100으로 제한해야 한다', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAllForAdmin({ limit: '200' });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
    });
  });

  describe('updateStatusByAdmin', () => {
    it('ACTIVE 유저를 SUSPENDED로 변경해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'user1',
        email: 'user1@test.com',
        password: 'hashed',
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersRepo.findOne.mockResolvedValue({ ...mockUser });
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.updateStatusByAdmin(1, UserStatus.SUSPENDED);

      expect(result).not.toHaveProperty('password');
      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 1 });
    });

    it('SUSPENDED 유저를 ACTIVE로 변경해야 한다', async () => {
      const mockUser = {
        id: 2,
        nickname: 'user2',
        email: 'user2@test.com',
        password: null,
        status: UserStatus.SUSPENDED,
        role: UserRole.USER,
      };
      mockUsersRepo.findOne.mockResolvedValue({ ...mockUser });
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));

      const result = await service.updateStatusByAdmin(2, UserStatus.ACTIVE);

      expect(result.status).toBe(UserStatus.ACTIVE);
      expect(mockRefreshTokenRepo.delete).not.toHaveBeenCalled();
    });

    it('DELETED 유저는 상태 변경이 불가능해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        id: 3,
        status: UserStatus.DELETED,
        role: UserRole.USER,
      });

      await expect(
        service.updateStatusByAdmin(3, UserStatus.ACTIVE),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADMIN 유저는 상태 변경이 불가능해야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        id: 4,
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
      });

      await expect(
        service.updateStatusByAdmin(4, UserStatus.SUSPENDED),
      ).rejects.toThrow(BadRequestException);
    });

    it('존재하지 않는 유저는 NotFoundException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatusByAdmin(999, UserStatus.SUSPENDED),
      ).rejects.toThrow(NotFoundException);
    });

    it('SUSPENDED로 변경 시 refresh token을 삭제해야 한다', async () => {
      const mockUser = {
        id: 5,
        nickname: 'user5',
        email: 'user5@test.com',
        password: null,
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      };
      mockUsersRepo.findOne.mockResolvedValue({ ...mockUser });
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));
      mockRefreshTokenRepo.delete.mockResolvedValue({ affected: 2 });

      await service.updateStatusByAdmin(5, UserStatus.SUSPENDED);

      expect(mockRefreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 5 });
    });
  });

  describe('updateProfileImage', () => {
    const mockFile = {
      buffer: Buffer.from('test-image'),
      mimetype: 'image/jpeg',
      size: 1024,
      originalname: 'test.jpg',
      fieldname: 'image',
    } as Express.Multer.File;

    it('이미지를 리사이즈하고 R2에 업로드 후 SafeUser를 반환해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'test',
        email: 'test@test.com',
        password: 'hashed',
        profileImage: undefined,
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockR2Storage.upload.mockResolvedValue('https://test.r2.dev/profiles/profile-1-123.webp');
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));

      const fixedTimestamp = 1740000000000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp);

      const result = await service.updateProfileImage(1, mockFile);

      expect(mockR2Storage.upload).toHaveBeenCalledWith(
        `profiles/profile-1-${fixedTimestamp}.webp`,
        Buffer.from('resized-image'),
        'image/webp',
      );
      expect(result).not.toHaveProperty('password');
      expect(result.profileImage).toBe('https://test.r2.dev/profiles/profile-1-123.webp');

      jest.restoreAllMocks();
    });

    it('기존 R2 이미지가 있으면 삭제 후 새 이미지를 업로드해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'test',
        email: 'test@test.com',
        password: 'hashed',
        profileImage: 'https://test.r2.dev/profiles/profile-1-old.webp',
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockR2Storage.upload.mockResolvedValue('https://test.r2.dev/profiles/profile-1-new.webp');
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));

      await service.updateProfileImage(1, mockFile);

      expect(mockR2Storage.delete).toHaveBeenCalledWith('profiles/profile-1-old.webp');
      expect(mockR2Storage.upload).toHaveBeenCalled();
    });

    it('소셜 프로필 이미지(외부 URL)는 R2 삭제를 호출하지 않아야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'test',
        email: 'test@test.com',
        password: null,
        profileImage: 'https://lh3.googleusercontent.com/photo.jpg',
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockR2Storage.upload.mockResolvedValue('https://test.r2.dev/profiles/profile-1-new.webp');
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));

      await service.updateProfileImage(1, mockFile);

      expect(mockR2Storage.delete).not.toHaveBeenCalled();
      expect(mockR2Storage.upload).toHaveBeenCalled();
    });

    it('지원하지 않는 이미지 형식이면 BadRequestException을 던져야 한다', async () => {
      const badFile = { ...mockFile, mimetype: 'application/pdf' } as Express.Multer.File;

      await expect(service.updateProfileImage(1, badFile)).rejects.toThrow(BadRequestException);
    });

    it('이미지 크기가 5MB를 초과하면 BadRequestException을 던져야 한다', async () => {
      const bigFile = { ...mockFile, size: 6 * 1024 * 1024 } as Express.Multer.File;

      await expect(service.updateProfileImage(1, bigFile)).rejects.toThrow(BadRequestException);
    });

    it('사용자가 존재하지 않으면 NotFoundException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.updateProfileImage(999, mockFile)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeProfileImage', () => {
    it('R2 이미지를 삭제하고 profileImage를 null로 설정해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'test',
        email: 'test@test.com',
        password: 'hashed',
        profileImage: 'https://test.r2.dev/profiles/profile-1-123.webp',
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));

      const result = await service.removeProfileImage(1);

      expect(mockR2Storage.delete).toHaveBeenCalledWith('profiles/profile-1-123.webp');
      expect(result).not.toHaveProperty('password');
      expect(result.profileImage).toBeUndefined();
    });

    it('소셜 프로필 이미지(외부 URL)는 R2 삭제 없이 null로 설정해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'test',
        password: null,
        profileImage: 'https://lh3.googleusercontent.com/photo.jpg',
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));

      await service.removeProfileImage(1);

      expect(mockR2Storage.delete).not.toHaveBeenCalled();
    });

    it('프로필 이미지가 없어도 정상 동작해야 한다', async () => {
      const mockUser = {
        id: 1,
        nickname: 'test',
        password: 'hashed',
        profileImage: undefined,
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);
      mockUsersRepo.save.mockImplementation((u: Record<string, unknown>) => Promise.resolve(u));

      const result = await service.removeProfileImage(1);

      expect(mockR2Storage.delete).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('password');
    });

    it('사용자가 존재하지 않으면 NotFoundException을 던져야 한다', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.removeProfileImage(999)).rejects.toThrow(NotFoundException);
    });
  });
});
