import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;

  const mockUsersRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
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
  });

  describe('softRemove (Deletion logic)', () => {
    it('should anonymize user before soft deleting', async () => {
      const mockUser = { id: 5, nickname: 'bob', email: 'bob@mail.com' };
      mockUsersRepo.findOne.mockResolvedValue(mockUser);

      // Mock Date.now() for predictable timestamp
      const fixedTimestamp = 1740000000000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp);

      await service.softRemove(5);

      // Should anonymize user data and save
      expect(mockUser.nickname).toEqual(`deleted_5_${fixedTimestamp}`);
      expect(mockUser.email).toEqual(`deleted_5_${fixedTimestamp}@deleted.local`);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(mockUser);

      // Should soft delete
      expect(mockUsersRepo.softDelete).toHaveBeenCalledWith(5);

      jest.restoreAllMocks();
    });
  });
});
