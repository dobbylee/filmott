import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewCommentsService } from './review-comments.service';

describe('ReviewsController', () => {
  let controller: ReviewsController;

  const mockReviewsService = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByContent: jest.fn(),
    findByUser: jest.fn(),
    getRecentReviews: jest.fn(),
    getContentStats: jest.fn(),
    toggleLike: jest.fn(),
  };

  const mockCommentsService = {
    create: jest.fn(),
    delete: jest.fn(),
    findByReview: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

  describe('POST /api/reviews', () => {
    it('should create a review', async () => {
      const dto = { contentId: 1, rating: 8, comment: 'Great!' };
      const user = { id: 1, nickname: 'test' };
      const created = { id: 1, ...dto, userId: 1 };
      mockReviewsService.create.mockResolvedValue(created);

      const result = await controller.create(user, dto);

      expect(result).toEqual(created);
      expect(mockReviewsService.create).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('PATCH /api/reviews/:id', () => {
    it('should update a review', async () => {
      const dto = { rating: 9 };
      const user = { id: 1, nickname: 'test' };
      const updated = { id: 1, rating: 9, likesCount: 0 };
      mockReviewsService.update.mockResolvedValue(updated);

      const result = await controller.update(user, 1, dto);

      expect(result).toEqual(updated);
      expect(mockReviewsService.update).toHaveBeenCalledWith(1, 1, dto);
    });
  });

  describe('DELETE /api/reviews/:id', () => {
    it('should delete a review and pass user role', async () => {
      const user = { id: 1, nickname: 'test', role: 'USER' };
      mockReviewsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(user, 1);

      expect(result).toEqual({ message: '삭제되었습니다.' });
      expect(mockReviewsService.delete).toHaveBeenCalledWith(1, 1, 'USER');
    });

    it('should pass ADMIN role to service for admin deletion', async () => {
      const user = { id: 99, nickname: 'admin', role: 'ADMIN' };
      mockReviewsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(user, 1);

      expect(result).toEqual({ message: '삭제되었습니다.' });
      expect(mockReviewsService.delete).toHaveBeenCalledWith(99, 1, 'ADMIN');
    });
  });

  describe('GET /api/reviews', () => {
    it('should return reviews by content with default params', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, totalPages: 0 };
      mockReviewsService.findByContent.mockResolvedValue(paginatedResult);

      const result = await controller.findByContent(1);

      expect(mockReviewsService.findByContent).toHaveBeenCalledWith(1, 1, 'latest');
      expect(result).toEqual(paginatedResult);
    });

    it('should pass page and sort params', async () => {
      mockReviewsService.findByContent.mockResolvedValue({ data: [], total: 0, page: 2, totalPages: 1 });

      await controller.findByContent(1, '2', 'likes');

      expect(mockReviewsService.findByContent).toHaveBeenCalledWith(1, 2, 'likes');
    });
  });

  describe('GET /api/reviews/recent', () => {
    it('should return recent reviews with default limit', async () => {
      mockReviewsService.getRecentReviews.mockResolvedValue([]);

      await controller.getRecent();

      expect(mockReviewsService.getRecentReviews).toHaveBeenCalledWith(10);
    });

    it('should pass custom limit', async () => {
      mockReviewsService.getRecentReviews.mockResolvedValue([]);

      await controller.getRecent('5');

      expect(mockReviewsService.getRecentReviews).toHaveBeenCalledWith(5);
    });
  });

  describe('GET /api/reviews/user/:userId', () => {
    it('should return reviews by user', async () => {
      mockReviewsService.findByUser.mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 });

      await controller.findByUser(1);

      expect(mockReviewsService.findByUser).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('POST /api/reviews/:id/like', () => {
    it('should toggle like', async () => {
      const user = { id: 1, nickname: 'test' };
      mockReviewsService.toggleLike.mockResolvedValue({ liked: true, likesCount: 1 });

      const result = await controller.toggleLike(user, 1);

      expect(result).toEqual({ liked: true, likesCount: 1 });
      expect(mockReviewsService.toggleLike).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('POST /api/reviews/:id/comments', () => {
    it('should create a comment', async () => {
      const user = { id: 1, nickname: 'test' };
      const dto = { content: 'Nice review!' };
      const created = { id: 1, userId: 1, reviewId: 1, content: 'Nice review!' };
      mockCommentsService.create.mockResolvedValue(created);

      const result = await controller.createComment(user, 1, dto);

      expect(result).toEqual(created);
      expect(mockCommentsService.create).toHaveBeenCalledWith(1, 1, dto);
    });
  });

  describe('DELETE /api/reviews/comments/:commentId', () => {
    it('should delete a comment and pass user role', async () => {
      const user = { id: 1, nickname: 'test', role: 'USER' };
      mockCommentsService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteComment(user, 1);

      expect(result).toEqual({ message: '댓글이 삭제되었습니다.' });
      expect(mockCommentsService.delete).toHaveBeenCalledWith(1, 1, 'USER');
    });

    it('should pass ADMIN role to service for admin comment deletion', async () => {
      const user = { id: 99, nickname: 'admin', role: 'ADMIN' };
      mockCommentsService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteComment(user, 1);

      expect(result).toEqual({ message: '댓글이 삭제되었습니다.' });
      expect(mockCommentsService.delete).toHaveBeenCalledWith(99, 1, 'ADMIN');
    });
  });

  describe('GET /api/reviews/:id/stats', () => {
    it('should return content stats', async () => {
      mockReviewsService.getContentStats.mockResolvedValue({
        averageRating: 7.5,
        reviewCount: 10,
      });

      const result = await controller.getStats(1);

      expect(mockReviewsService.getContentStats).toHaveBeenCalledWith(1);
      expect(result).toEqual({ averageRating: 7.5, reviewCount: 10 });
    });
  });

  describe('GET /api/reviews/:id/comments', () => {
    it('should return comments with default page', async () => {
      mockCommentsService.findByReview.mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 });

      await controller.getComments(1);

      expect(mockCommentsService.findByReview).toHaveBeenCalledWith(1, 1);
    });

    it('should pass custom page parameter', async () => {
      mockCommentsService.findByReview.mockResolvedValue({ data: [], total: 0, page: 2, totalPages: 1 });

      await controller.getComments(1, '2');

      expect(mockCommentsService.findByReview).toHaveBeenCalledWith(1, 2);
    });
  });
});
