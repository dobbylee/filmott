import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewCommentsService } from './review-comments.service';

describe('ReviewsController', () => {
  let controller: ReviewsController;

  const mockReviewsService = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMyReview: jest.fn(),
    findByContent: jest.fn(),
    findByUser: jest.fn(),
    getRecentReviews: jest.fn(),
    getContentStats: jest.fn(),
    toggleLike: jest.fn(),
    getLikedReviewIds: jest.fn(),
    getLikedReviewIdsByIds: jest.fn(),
  };

  const mockCommentsService = {
    create: jest.fn(),
    delete: jest.fn(),
    findByReview: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [ReviewsController],
      providers: [
        { provide: ReviewsService, useValue: mockReviewsService },
        { provide: ReviewCommentsService, useValue: mockCommentsService },
      ],
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/reviews/my', () => {
    it('콘텐츠에 대한 내 리뷰를 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'test' };
      const review = { id: 1, userId: 1, contentId: 5, rating: 8, commentsCount: 2 };
      mockReviewsService.findMyReview.mockResolvedValue(review);

      const result = await controller.findMyReview(user, 5);

      expect(mockReviewsService.findMyReview).toHaveBeenCalledWith(1, 5);
      expect(result).toEqual(review);
    });

    it('내 리뷰가 존재하지 않으면 null을 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'test' };
      mockReviewsService.findMyReview.mockResolvedValue(null);

      const result = await controller.findMyReview(user, 99);

      expect(result).toBeNull();
    });
  });

  describe('GET /api/reviews/liked-ids', () => {
    it('reviewIds가 제공되면 reviewIds로 좋아요한 ID를 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'test' };
      mockReviewsService.getLikedReviewIdsByIds.mockResolvedValue([2, 4]);

      const result = await controller.getLikedIds(user, undefined, '2,4,6');

      expect(mockReviewsService.getLikedReviewIdsByIds).toHaveBeenCalledWith(1, [2, 4, 6]);
      expect(result).toEqual([2, 4]);
    });

    it('contentId가 제공되면 contentId로 좋아요한 ID를 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'test' };
      mockReviewsService.getLikedReviewIds.mockResolvedValue([1, 3]);

      const result = await controller.getLikedIds(user, '5');

      expect(mockReviewsService.getLikedReviewIds).toHaveBeenCalledWith(1, 5);
      expect(result).toEqual([1, 3]);
    });

    it('contentId가 0으로 파싱되면 빈 배열을 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'test' };

      const result = await controller.getLikedIds(user, '0');

      expect(mockReviewsService.getLikedReviewIds).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('contentId와 reviewIds 모두 제공되지 않으면 빈 배열을 반환해야 한다', async () => {
      const user = { id: 1, nickname: 'test' };

      const result = await controller.getLikedIds(user, undefined, undefined);

      expect(result).toEqual([]);
    });
  });

  describe('DELETE /api/reviews/:id', () => {
    it('리뷰를 삭제하고 사용자 역할을 전달해야 한다', async () => {
      const user = { id: 1, nickname: 'test', role: 'USER' };
      mockReviewsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(user, 1);

      expect(result).toEqual({ message: '삭제되었습니다.' });
      expect(mockReviewsService.delete).toHaveBeenCalledWith(1, 1, 'USER');
    });

    it('관리자 삭제 시 서비스에 ADMIN 역할을 전달해야 한다', async () => {
      const user = { id: 99, nickname: 'admin', role: 'ADMIN' };
      mockReviewsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(user, 1);

      expect(result).toEqual({ message: '삭제되었습니다.' });
      expect(mockReviewsService.delete).toHaveBeenCalledWith(99, 1, 'ADMIN');
    });
  });

  describe('GET /api/reviews', () => {
    it('기본 파라미터로 콘텐츠별 리뷰를 반환해야 한다', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, totalPages: 0 };
      mockReviewsService.findByContent.mockResolvedValue(paginatedResult);

      await controller.findByContent(1);

      expect(mockReviewsService.findByContent).toHaveBeenCalledWith(1, 1, 'latest');
    });

    it('page와 sort 파라미터를 전달해야 한다', async () => {
      mockReviewsService.findByContent.mockResolvedValue({ data: [], total: 0, page: 2, totalPages: 1 });

      await controller.findByContent(1, '2', 'likes');

      expect(mockReviewsService.findByContent).toHaveBeenCalledWith(1, 2, 'likes');
    });
  });

  describe('GET /api/reviews/recent', () => {
    it('기본 limit으로 최근 리뷰를 반환해야 한다', async () => {
      mockReviewsService.getRecentReviews.mockResolvedValue([]);

      await controller.getRecent();

      expect(mockReviewsService.getRecentReviews).toHaveBeenCalledWith(10);
    });

    it('사용자 지정 limit을 전달해야 한다', async () => {
      mockReviewsService.getRecentReviews.mockResolvedValue([]);

      await controller.getRecent('5');

      expect(mockReviewsService.getRecentReviews).toHaveBeenCalledWith(5);
    });

    it('limit을 50으로 제한해야 한다', async () => {
      mockReviewsService.getRecentReviews.mockResolvedValue([]);

      await controller.getRecent('100');

      expect(mockReviewsService.getRecentReviews).toHaveBeenCalledWith(50);
    });

    it('최소 limit 1을 강제해야 한다', async () => {
      mockReviewsService.getRecentReviews.mockResolvedValue([]);

      await controller.getRecent('0');

      expect(mockReviewsService.getRecentReviews).toHaveBeenCalledWith(1);
    });

    it('숫자가 아닌 limit에 대해 BadRequestException을 던져야 한다', async () => {
      await expect(controller.getRecent('abc')).rejects.toThrow(BadRequestException);
    });
  });

  describe('parseInt NaN 검증', () => {
    it('findByContent에서 숫자가 아닌 page에 대해 BadRequestException을 던져야 한다', async () => {
      await expect(controller.findByContent(1, 'abc')).rejects.toThrow(BadRequestException);
    });

    it('findByUser에서 숫자가 아닌 page에 대해 BadRequestException을 던져야 한다', async () => {
      await expect(controller.findByUser(1, 'xyz')).rejects.toThrow(BadRequestException);
    });

    it('getComments에서 숫자가 아닌 page에 대해 BadRequestException을 던져야 한다', async () => {
      await expect(controller.getComments(1, 'notanumber')).rejects.toThrow(BadRequestException);
    });

    it('getLikedIds에서 숫자가 아닌 contentId에 대해 BadRequestException을 던져야 한다', async () => {
      const user = { id: 1, nickname: 'test' };

      await expect(controller.getLikedIds(user, 'abc')).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /api/reviews/user/:userId', () => {
    it('사용자별 리뷰를 반환해야 한다', async () => {
      mockReviewsService.findByUser.mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 });

      await controller.findByUser(1);

      expect(mockReviewsService.findByUser).toHaveBeenCalledWith(1, 1, 20);
    });

    it('ThrottlerGuard가 적용되어 있어야 한다', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        ReviewsController.prototype.findByUser,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(ThrottlerGuard);
    });
  });

  describe('DELETE /api/reviews/comments/:commentId', () => {
    it('댓글을 삭제하고 사용자 역할을 전달해야 한다', async () => {
      const user = { id: 1, nickname: 'test', role: 'USER' };
      mockCommentsService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteComment(user, 1);

      expect(result).toEqual({ message: '댓글이 삭제되었습니다.' });
      expect(mockCommentsService.delete).toHaveBeenCalledWith(1, 1, 'USER');
    });

    it('관리자 댓글 삭제 시 서비스에 ADMIN 역할을 전달해야 한다', async () => {
      const user = { id: 99, nickname: 'admin', role: 'ADMIN' };
      mockCommentsService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteComment(user, 1);

      expect(result).toEqual({ message: '댓글이 삭제되었습니다.' });
      expect(mockCommentsService.delete).toHaveBeenCalledWith(99, 1, 'ADMIN');
    });
  });

  describe('GET /api/reviews/:id/comments', () => {
    it('기본 page로 댓글을 반환해야 한다', async () => {
      mockCommentsService.findByReview.mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 });

      await controller.getComments(1);

      expect(mockCommentsService.findByReview).toHaveBeenCalledWith(1, 1);
    });

    it('사용자 지정 page 파라미터를 전달해야 한다', async () => {
      mockCommentsService.findByReview.mockResolvedValue({ data: [], total: 0, page: 2, totalPages: 1 });

      await controller.getComments(1, '2');

      expect(mockCommentsService.findByReview).toHaveBeenCalledWith(1, 2);
    });
  });
});
