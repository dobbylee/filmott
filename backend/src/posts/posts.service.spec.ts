import { Test, TestingModule } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Post } from './post.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PostsService', () => {
  let service: PostsService;

  const mockPostsRepo = {
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    increment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getRepositoryToken(Post), useValue: mockPostsRepo },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated result with data, total, page, limit, totalPages', async () => {
      const mockPosts = [
        { id: 2, title: 'Post 2' },
        { id: 1, title: 'Post 1' },
      ];
      mockPostsRepo.findAndCount.mockResolvedValue([mockPosts, 2]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: mockPosts,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(mockPostsRepo.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should calculate skip as (page - 1) * limit', async () => {
      mockPostsRepo.findAndCount.mockResolvedValue([[], 50]);

      await service.findAll({ page: 3, limit: 10 });

      expect(mockPostsRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should calculate totalPages correctly using Math.ceil', async () => {
      mockPostsRepo.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });

    it('should return totalPages of 0 when there are no posts', async () => {
      mockPostsRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if post is not found', async () => {
      mockPostsRepo.findOne.mockResolvedValue(null);
      await expect(service.update(999, { title: 'New' }, { id: 1, username: 'user1' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if post has no author (soft deleted user)', async () => {
      mockPostsRepo.findOne.mockResolvedValue({ id: 1, title: 'Old', author: null });
      await expect(service.update(1, { title: 'New' }, { id: 1, username: 'user1' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user is not author', async () => {
      mockPostsRepo.findOne.mockResolvedValue({ id: 1, title: 'Old', author: { id: 2 } });
      await expect(service.update(1, { title: 'New' }, { id: 1, username: 'user1' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should update post if user is author', async () => {
      const mockPost = { id: 1, title: 'Old', author: { id: 1 } };
      mockPostsRepo.findOne.mockResolvedValue(mockPost);
      mockPostsRepo.save.mockResolvedValue({ ...mockPost, title: 'New' });

      const result = await service.update(1, { title: 'New' }, { id: 1, username: 'user1' });
      expect(result.title).toBe('New');
      expect(mockPostsRepo.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should throw ForbiddenException if user is not author', async () => {
      mockPostsRepo.findOne.mockResolvedValue({ id: 1, author: { id: 2 } });
      await expect(service.remove(1, { id: 1, username: 'user1' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should delete post if user is author', async () => {
      const mockPost = { id: 1, author: { id: 1 } };
      mockPostsRepo.findOne.mockResolvedValue(mockPost);

      await service.remove(1, { id: 1, username: 'user1' });
      expect(mockPostsRepo.remove).toHaveBeenCalledWith(mockPost);
    });
  });
});
