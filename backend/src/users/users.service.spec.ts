import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { User } from './user.entity';
import { UserStatus } from './enums/user-status.enum';
import { UserRole } from './enums/user-role.enum';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;

  const mockUsersRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should query with Not(DELETED) status condition to include ACTIVE and SUSPENDED', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await service.findOne('test');

      expect(mockUsersRepo.findOne).toHaveBeenCalledWith({
        where: { nickname: 'test', status: Not(UserStatus.DELETED) },
      });
    });
  });

  describe('findById', () => {
    it('should return SafeUser without password when user exists', async () => {
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

    it('should return null when user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should throw ConflictException if nickname is already taken', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce({ id: 1, nickname: 'existing' });

      await expect(service.create({ nickname: 'existing', email: 'test@test.com', password: 'password' }))
        .rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockUsersRepo.findOne.mockResolvedValueOnce(null); // nickname not found
      mockUsersRepo.findOne.mockResolvedValueOnce({ id: 1, email: 'taken@test.com' }); // email found

      await expect(service.create({ nickname: 'new', email: 'taken@test.com', password: 'password' }))
        .rejects.toThrow(ConflictException);
    });

    it('should successfully create a new user and return without password', async () => {
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

  describe('update', () => {
    it('should throw NotFoundException if user is not found', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      await expect(service.update(999, { nickname: 'changed' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if newPassword is provided without currentPassword', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 1, nickname: 'test', password: 'hashed' });
      await expect(service.update(1, { newPassword: 'newpass12' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if currentPassword is incorrect', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 1, nickname: 'test', password: 'hashed' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.update(1, { currentPassword: 'wrongpass', newPassword: 'newpass12' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if new nickname is already taken', async () => {
      mockUsersRepo.findOne
        .mockResolvedValueOnce({ id: 1, nickname: 'original', password: 'hashed' }) // findOne by id
        .mockResolvedValueOnce({ id: 2, nickname: 'taken' }); // findOne by new nickname

      await expect(
        service.update(1, { nickname: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should update nickname successfully', async () => {
      const mockUser = { id: 1, nickname: 'original', email: 'test@test.com', password: 'hashed' };
      mockUsersRepo.findOne
        .mockResolvedValueOnce(mockUser) // findOne by id
        .mockResolvedValueOnce(null);   // findOne by new nickname (not taken)
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.update(1, { nickname: 'updated' });

      expect(result.nickname).toBe('updated');
      expect(result).not.toHaveProperty('password');
    });

    it('should update password successfully', async () => {
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

    it('should skip nickname update if same as current', async () => {
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
    it('should return false for non-ACTIVE user', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        id: 1,
        password: 'hashed',
        status: UserStatus.DELETED,
      });

      const result = await service.verifyPassword(1, 'password');

      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should verify password for ACTIVE user', async () => {
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
    it('should anonymize user and set status to DELETED', async () => {
      const mockUser: Record<string, any> = {
        id: 5,
        nickname: 'bob',
        email: 'bob@mail.com',
        status: UserStatus.ACTIVE,
      };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);

      // Mock Date.now() for predictable timestamp
      const fixedTimestamp = 1740000000000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp);

      await service.deactivate(5);

      // Should anonymize user data, set status to DELETED, and save
      expect(mockUser.nickname).toEqual(`deleted_5_${fixedTimestamp}`);
      expect(mockUser.email).toEqual(`deleted_5_${fixedTimestamp}@deleted.local`);
      expect(mockUser.status).toEqual(UserStatus.DELETED);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(mockUser);

      jest.restoreAllMocks();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.deactivate(999)).rejects.toThrow(NotFoundException);
    });
  });
});
