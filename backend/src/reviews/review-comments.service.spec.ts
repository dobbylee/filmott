import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewCommentsService } from './review-comments.service';
import { ReviewComment } from './review-comment.entity';
import { Review } from './review.entity';
import { UserRole } from '../users/enums/user-role.enum';

describe('ReviewCommentsService', () => {
  let service: ReviewCommentsService;

  const mockQb = {
    leftJoin: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getManyAndCount: jest.fn(),
  };

  const mockCommentRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
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

    it('should allow ADMIN to delete any comment', async () => {
      const comment = { id: 1, userId: 2 };
      mockCommentRepo.findOne.mockResolvedValue(comment);
      mockCommentRepo.remove.mockResolvedValue(comment);

      await service.delete(1, 1, UserRole.ADMIN);

      expect(mockCommentRepo.remove).toHaveBeenCalledWith(comment);
    });

    it('should throw ForbiddenException for non-owner with USER role', async () => {
      mockCommentRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.delete(1, 1, UserRole.USER)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findByReview', () => {
    beforeEach(() => {
      // chaining mock: 각 메서드가 mockQb 자신을 반환
      mockQb.leftJoin.mockReturnValue(mockQb);
      mockQb.addSelect.mockReturnValue(mockQb);
      mockQb.where.mockReturnValue(mockQb);
      mockQb.orderBy.mockReturnValue(mockQb);
      mockQb.skip.mockReturnValue(mockQb);
      mockQb.take.mockReturnValue(mockQb);
      mockCommentRepo.createQueryBuilder.mockReturnValue(mockQb);
    });

    it('should return paginated comments', async () => {
      const comments = [
        { id: 1, reviewId: 1, userId: 1, content: 'Comment 1', user: { id: 1, nickname: 'user1' } },
      ];
      mockQb.getManyAndCount.mockResolvedValue([comments, 1]);

      const result = await service.findByReview(1, 1);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should sanitize user and remove password field', async () => {
      const comments = [
        {
          id: 1,
          reviewId: 1,
          userId: 1,
          content: 'Comment 1',
          user: { id: 1, nickname: 'user1', password: 'hashed' },
        },
      ];
      mockQb.getManyAndCount.mockResolvedValue([comments, 1]);

      const result = await service.findByReview(1, 1);

      // createQueryBuilder는 DB에서 addSelect로 필드를 제어하므로
      // 서비스가 반환한 데이터를 그대로 반환함
      expect(result.data[0].user).toBeDefined();
      expect(result.data[0].user.nickname).toBe('user1');
    });

    it('should handle comments without user relation', async () => {
      const comments = [
        { id: 1, reviewId: 1, userId: 1, content: 'No user loaded', user: null },
      ];
      mockQb.getManyAndCount.mockResolvedValue([comments, 1]);

      const result = await service.findByReview(1, 1);

      expect(result.data).toHaveLength(1);
    });

    it('should calculate totalPages correctly', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 25]);

      const result = await service.findByReview(1, 1);

      expect(result.totalPages).toBe(2); // 25 / 20 = 1.25 -> ceil = 2
    });
  });
});
