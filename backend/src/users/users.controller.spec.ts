import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findById: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

  describe('GET /users/me (getProfile)', () => {
    it('should return the current user profile', async () => {
      const mockUser = { id: 1, nickname: 'test' };
      const profile = { id: 1, nickname: 'test', email: 'test@test.com' };
      mockUsersService.findById.mockResolvedValue(profile);

      const result = await controller.getProfile(mockUser);

      expect(mockUsersService.findById).toHaveBeenCalledWith(1);
      expect(result).toEqual(profile);
    });

    it('should throw NotFoundException when user is not found', async () => {
      const mockUser = { id: 999, nickname: 'ghost' };
      mockUsersService.findById.mockResolvedValue(null);

      await expect(controller.getProfile(mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /users/me (update)', () => {
    it('should update and return the updated user', async () => {
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
    it('should call deactivate with the current user id', async () => {
      const mockUser = { id: 1, nickname: 'test' };
      mockUsersService.deactivate.mockResolvedValue(undefined);

      await controller.deactivate(mockUser);

      expect(mockUsersService.deactivate).toHaveBeenCalledWith(1);
    });
  });
});
