import { Test, TestingModule } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Post } from './post.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PostsService', () => {
  let service: PostsService;

  const mockPostsRepo = {
    find: jest.fn(),
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
