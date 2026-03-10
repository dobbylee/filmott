import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewCommentsService } from './review-comments.service';
import { ReviewComment } from './review-comment.entity';
import { Review } from './review.entity';

describe('ReviewCommentsService', () => {
  let service: ReviewCommentsService;

  const mockCommentRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockReviewRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewCommentsService,
        { provide: getRepositoryToken(ReviewComment), useValue: mockCommentRepo },
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
      ],
    }).compile();

    service = module.get<ReviewCommentsService>(ReviewCommentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a comment on existing review', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1 });
      const created = { id: 1, userId: 1, reviewId: 1, content: 'Nice review!' };
      mockCommentRepo.create.mockReturnValue(created);
      mockCommentRepo.save.mockResolvedValue(created);

      const result = await service.create(1, 1, { content: 'Nice review!' });

      expect(result).toEqual(created);
      expect(mockCommentRepo.create).toHaveBeenCalledWith({
        userId: 1,
        reviewId: 1,
        content: 'Nice review!',
      });
    });

    it('should throw NotFoundException when review not found', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(1, 999, { content: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete comment when owned by user', async () => {
      const comment = { id: 1, userId: 1 };
      mockCommentRepo.findOne.mockResolvedValue(comment);
      mockCommentRepo.remove.mockResolvedValue(comment);

      await service.delete(1, 1);

      expect(mockCommentRepo.remove).toHaveBeenCalledWith(comment);
    });

    it('should throw NotFoundException when comment not found', async () => {
      mockCommentRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not the owner', async () => {
      mockCommentRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.delete(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByReview', () => {
    it('should return paginated comments', async () => {
      const comments = [
        { id: 1, reviewId: 1, userId: 1, content: 'Comment 1', user: { id: 1, nickname: 'user1' } },
      ];
      mockCommentRepo.findAndCount.mockResolvedValue([comments, 1]);

      const result = await service.findByReview(1, 1);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should calculate totalPages correctly', async () => {
      mockCommentRepo.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.findByReview(1, 1);

      expect(result.totalPages).toBe(2); // 25 / 20 = 1.25 -> ceil = 2
    });
  });
});
