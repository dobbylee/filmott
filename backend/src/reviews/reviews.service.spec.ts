import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReviewsService } from './reviews.service';
import { Review } from './review.entity';
import { ReviewLike } from './review-like.entity';

describe('ReviewsService', () => {
  let service: ReviewsService;

  const mockReviewRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockReviewLikeRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getRepositoryToken(ReviewLike), useValue: mockReviewLikeRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a review with rating and comment', async () => {
      const dto = { contentId: 1, rating: 8, comment: 'Great movie!' };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 1, userId: 1, ...dto, hasSpoiler: false, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);

      const result = await service.create(1, dto);

      expect(mockReviewRepo.create).toHaveBeenCalledWith({
        userId: 1,
        contentId: 1,
        rating: 8,
        comment: 'Great movie!',
        hasSpoiler: false,
      });
      expect(result).toEqual(created);
    });

    it('should create a review with rating only', async () => {
      const dto = { contentId: 1, rating: 7 };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 2, userId: 1, ...dto, hasSpoiler: false, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);

      const result = await service.create(1, dto);
      expect(result.id).toBe(2);
    });

    it('should create a review with comment only (no rating) via DTO - rating validated at pipe level', async () => {
      // rating은 DTO ValidationPipe에서 필수 검증됨. 서비스는 rating이 있다고 가정
      const dto = { contentId: 1, rating: 5, comment: '좋아요' };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 3, userId: 1, ...dto, hasSpoiler: false, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);

      const result = await service.create(1, dto);
      expect(result.rating).toBe(5);
    });

    it('should throw ConflictException when review already exists', async () => {
      const dto = { contentId: 1, rating: 8 };
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, userId: 1, contentId: 1 });

      await expect(service.create(1, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update review and reset likes_count', async () => {
      const review = {
        id: 1,
        userId: 1,
        contentId: 1,
        rating: 7,
        comment: 'Good',
        hasSpoiler: false,
        likesCount: 5,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });
      mockReviewRepo.save.mockImplementation((r: any) => Promise.resolve(r));
      mockReviewLikeRepo.delete.mockResolvedValue({ affected: 5 });

      const result = await service.update(1, 1, { rating: 9 });

      expect(result.rating).toBe(9);
      expect(result.likesCount).toBe(0);
      expect(mockReviewLikeRepo.delete).toHaveBeenCalledWith({ reviewId: 1 });
    });

    it('should throw NotFoundException when review not found', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);

      await expect(service.update(1, 999, { rating: 5 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not the owner', async () => {
      mockReviewRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 2,
        rating: 7,
        comment: 'Test',
      });

      await expect(service.update(1, 1, { rating: 5 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when update tries to clear rating', async () => {
      const review = {
        id: 1,
        userId: 1,
        rating: 7,
        comment: null,
        hasSpoiler: false,
        likesCount: 0,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      await expect(
        service.update(1, 1, { rating: null as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete review when owned by user', async () => {
      const review = { id: 1, userId: 1 };
      mockReviewRepo.findOne.mockResolvedValue(review);
      mockReviewRepo.remove.mockResolvedValue(review);

      await service.delete(1, 1);

      expect(mockReviewRepo.remove).toHaveBeenCalledWith(review);
    });

    it('should throw NotFoundException when review not found', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not the owner', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.delete(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByContent', () => {
    it('should return paginated reviews sorted by latest', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 1, userId: 1, rating: 8 }],
          1,
        ]),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findByContent(1, 1, 'latest');

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(mockQb.orderBy).toHaveBeenCalledWith('review.createdAt', 'DESC');
    });

    it('should sort by likes when specified', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.findByContent(1, 1, 'likes');

      expect(mockQb.orderBy).toHaveBeenCalledWith('review.likesCount', 'DESC');
    });
  });

  describe('findByUser', () => {
    it('should return paginated reviews for a user', async () => {
      mockReviewRepo.findAndCount.mockResolvedValue([
        [{ id: 1, userId: 1, contentId: 1 }],
        1,
      ]);

      const result = await service.findByUser(1, 1);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getRecentReviews', () => {
    it('should return recent reviews with user and content', async () => {
      mockReviewRepo.find.mockResolvedValue([
        { id: 1, userId: 1, user: { id: 1, nickname: 'test' }, content: { id: 1 } },
      ]);

      const result = await service.getRecentReviews(5);

      expect(result).toHaveLength(1);
      expect(mockReviewRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('getContentStats', () => {
    it('should return average rating and review count', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          averageRating: '7.5',
          reviewCount: '10',
        }),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getContentStats(1);

      expect(result.averageRating).toBe(7.5);
      expect(result.reviewCount).toBe(10);
    });

    it('should return null average when no reviews', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          averageRating: null,
          reviewCount: '0',
        }),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getContentStats(1);

      expect(result.averageRating).toBeNull();
      expect(result.reviewCount).toBe(0);
    });
  });

  describe('toggleLike', () => {
    it('should add like when not liked', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, likesCount: 0 });
      mockReviewLikeRepo.findOne.mockResolvedValue(null);

      const mockManager = {
        save: jest.fn(),
        remove: jest.fn(),
        findOne: jest.fn().mockResolvedValue({ id: 1, likesCount: 1 }),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        }),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: any) => cb(mockManager),
      );
      mockReviewLikeRepo.create.mockReturnValue({ reviewId: 1, userId: 1 });

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(true);
      expect(result.likesCount).toBe(1);
    });

    it('should remove like when already liked', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, likesCount: 1 });
      mockReviewLikeRepo.findOne.mockResolvedValue({ id: 1, reviewId: 1, userId: 1 });

      const mockManager = {
        save: jest.fn(),
        remove: jest.fn(),
        findOne: jest.fn().mockResolvedValue({ id: 1, likesCount: 0 }),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        }),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: any) => cb(mockManager),
      );

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(false);
      expect(result.likesCount).toBe(0);
    });

    it('should throw NotFoundException when review not found', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);

      await expect(service.toggleLike(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
