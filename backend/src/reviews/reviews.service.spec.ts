import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ReviewsService } from './reviews.service';
import { Review } from './review.entity';
import { ReviewLike } from './review-like.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { WatchlistService } from '../watchlist/watchlist.service';

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
    createQueryBuilder: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockWatchlistService = {
    getWatchlistStatus: jest.fn(),
    addToWatchlistByContentId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getRepositoryToken(ReviewLike), useValue: mockReviewLikeRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: WatchlistService, useValue: mockWatchlistService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('별점과 코멘트로 리뷰를 생성해야 한다', async () => {
      const dto = { contentId: 1, rating: 8, comment: 'Great movie!' };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 1, userId: 1, ...dto, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);
      mockWatchlistService.getWatchlistStatus.mockResolvedValue({ status: null, watchlistId: null });
      mockWatchlistService.addToWatchlistByContentId.mockResolvedValue({});

      const result = await service.create(1, dto);

      expect(mockReviewRepo.create).toHaveBeenCalledWith({
        userId: 1,
        contentId: 1,
        rating: 8,
        comment: 'Great movie!',

      });
      expect(result).toEqual(created);
      expect(mockWatchlistService.addToWatchlistByContentId).toHaveBeenCalledWith(1, 1, 'watched', undefined);
    });

    it('별점만으로 리뷰를 생성해야 한다', async () => {
      const dto = { contentId: 1, rating: 7 };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 2, userId: 1, ...dto, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);
      mockWatchlistService.getWatchlistStatus.mockResolvedValue({ status: null, watchlistId: null });
      mockWatchlistService.addToWatchlistByContentId.mockResolvedValue({});

      const result = await service.create(1, dto);
      expect(result.id).toBe(2);
    });

    it('DTO를 통해 코멘트만으로 리뷰를 생성해야 한다 - rating은 파이프 레벨에서 검증', async () => {
      // rating은 DTO ValidationPipe에서 필수 검증됨. 서비스는 rating이 있다고 가정
      const dto = { contentId: 1, rating: 5, comment: '좋아요' };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 3, userId: 1, ...dto, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);
      mockWatchlistService.getWatchlistStatus.mockResolvedValue({ status: null, watchlistId: null });
      mockWatchlistService.addToWatchlistByContentId.mockResolvedValue({});

      const result = await service.create(1, dto);
      expect(result.rating).toBe(5);
    });

    it('이미 감상한 경우 워치리스트에 추가하지 않아야 한다', async () => {
      const dto = { contentId: 1, rating: 8 };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 4, userId: 1, ...dto, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);
      mockWatchlistService.getWatchlistStatus.mockResolvedValue({ status: 'watched', watchlistId: 1 });

      await service.create(1, dto);
      expect(mockWatchlistService.addToWatchlistByContentId).not.toHaveBeenCalled();
    });

    it('리뷰 생성 시 want_to_watch를 watched로 전환해야 한다', async () => {
      const dto = { contentId: 1, rating: 9 };
      mockReviewRepo.findOne.mockResolvedValue(null);
      const created = { id: 5, userId: 1, ...dto, likesCount: 0 };
      mockReviewRepo.create.mockReturnValue(created);
      mockReviewRepo.save.mockResolvedValue(created);
      mockWatchlistService.getWatchlistStatus.mockResolvedValue({ status: 'want_to_watch', watchlistId: 2 });
      mockWatchlistService.addToWatchlistByContentId.mockResolvedValue({});

      await service.create(1, dto);
      expect(mockWatchlistService.addToWatchlistByContentId).toHaveBeenCalledWith(1, 1, 'watched', undefined);
    });

    it('리뷰가 이미 존재하면 ConflictException을 던져야 한다', async () => {
      const dto = { contentId: 1, rating: 8 };
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, userId: 1, contentId: 1 });

      await expect(service.create(1, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('rating 변경 시 likes_count를 초기화하고 좋아요를 삭제해야 한다', async () => {
      const review = {
        id: 1,
        userId: 1,
        contentId: 1,
        rating: 7,
        comment: 'Good',

        likesCount: 5,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      const mockManager = {
        delete: jest.fn().mockResolvedValue({ affected: 5 }),
        save: jest.fn().mockImplementation((r: Partial<Review>) => Promise.resolve(r)),
      };
      mockDataSource.transaction.mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) => cb(mockManager as unknown as EntityManager));

      const result = await service.update(1, 1, { rating: 9 });

      expect(result.rating).toBe(9);
      expect(result.likesCount).toBe(0);
      expect(mockManager.delete).toHaveBeenCalledWith(expect.anything(), { reviewId: 1 });
    });

    it('코멘트만 변경 시에도 좋아요를 초기화해야 한다', async () => {
      const review = {
        id: 1,
        userId: 1,
        contentId: 1,
        rating: 7,
        comment: 'Good',

        likesCount: 5,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      const mockManager = {
        delete: jest.fn().mockResolvedValue({ affected: 5 }),
        save: jest.fn().mockImplementation((r: Partial<Review>) => Promise.resolve(r)),
      };
      mockDataSource.transaction.mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) => cb(mockManager as unknown as EntityManager));

      const result = await service.update(1, 1, { comment: 'Updated comment' });

      expect(result.comment).toBe('Updated comment');
      expect(result.rating).toBe(7);
      expect(result.likesCount).toBe(0);
      expect(mockManager.delete).toHaveBeenCalledWith(expect.anything(), { reviewId: 1 });
    });

    it('rating과 코멘트 동시 변경 시 좋아요를 초기화해야 한다', async () => {
      const review = {
        id: 1,
        userId: 1,
        contentId: 1,
        rating: 7,
        comment: 'Good',

        likesCount: 3,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      const mockManager = {
        delete: jest.fn().mockResolvedValue({ affected: 3 }),
        save: jest.fn().mockImplementation((r: Partial<Review>) => Promise.resolve(r)),
      };
      mockDataSource.transaction.mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) => cb(mockManager as unknown as EntityManager));

      const result = await service.update(1, 1, { rating: 9, comment: 'New comment' });

      expect(result.rating).toBe(9);
      expect(result.comment).toBe('New comment');
      expect(result.likesCount).toBe(0);
      expect(mockManager.delete).toHaveBeenCalledWith(expect.anything(), { reviewId: 1 });
    });

    it('rating과 코멘트 모두 동일하면 좋아요를 유지해야 한다', async () => {
      const review = {
        id: 1,
        userId: 1,
        contentId: 1,
        rating: 7,
        comment: 'Good',

        likesCount: 10,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });
      mockReviewRepo.save.mockImplementation((r: Partial<Review>) => Promise.resolve(r));

      const result = await service.update(1, 1, { rating: 7, comment: 'Good' });

      expect(result.rating).toBe(7);
      expect(result.likesCount).toBe(10);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('리뷰를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);

      await expect(service.update(1, 999, { rating: 5 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('소유자가 아니면 ForbiddenException을 던져야 한다', async () => {
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

    it('수정 시 rating을 제거하려 하면 BadRequestException을 던져야 한다', async () => {
      const review = {
        id: 1,
        userId: 1,
        rating: 7,
        comment: null,

        likesCount: 0,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      await expect(
        service.update(1, 1, { rating: null as unknown as number }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('소유자가 리뷰를 삭제할 수 있어야 한다', async () => {
      const review = { id: 1, userId: 1 };
      mockReviewRepo.findOne.mockResolvedValue(review);
      mockReviewRepo.remove.mockResolvedValue(review);

      await service.delete(1, 1);

      expect(mockReviewRepo.remove).toHaveBeenCalledWith(review);
    });

    it('리뷰를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('소유자가 아니면 ForbiddenException을 던져야 한다', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.delete(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN은 모든 리뷰를 삭제할 수 있어야 한다', async () => {
      const review = { id: 1, userId: 2 };
      mockReviewRepo.findOne.mockResolvedValue(review);
      mockReviewRepo.remove.mockResolvedValue(review);

      await service.delete(1, 1, UserRole.ADMIN);

      expect(mockReviewRepo.remove).toHaveBeenCalledWith(review);
    });

    it('USER 역할의 비소유자에게 ForbiddenException을 던져야 한다', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.delete(1, 1, UserRole.USER)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findMyReview', () => {
    it('commentsCount가 포함된 내 리뷰를 반환해야 한다', async () => {
      const review = { id: 1, userId: 1, contentId: 5, rating: 8, commentsCount: 3 };
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(review),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findMyReview(1, 5);

      expect(result).toEqual(review);
      expect(mockQb.where).toHaveBeenCalledWith('review.userId = :userId', { userId: 1 });
      expect(mockQb.andWhere).toHaveBeenCalledWith('review.contentId = :contentId', { contentId: 5 });
    });

    it('내 리뷰가 존재하지 않으면 null을 반환해야 한다', async () => {
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findMyReview(1, 999);

      expect(result).toBeNull();
    });
  });

  describe('getLikedReviewIds', () => {
    it('콘텐츠에 대한 좋아요한 리뷰 ID를 반환해야 한다', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ reviewId: 1 }, { reviewId: 3 }]),
      };
      mockReviewLikeRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getLikedReviewIds(1, 5);

      expect(result).toEqual([1, 3]);
      expect(mockQb.where).toHaveBeenCalledWith('rl.userId = :userId', { userId: 1 });
    });

    it('좋아요가 없으면 빈 배열을 반환해야 한다', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockReviewLikeRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getLikedReviewIds(1, 99);

      expect(result).toEqual([]);
    });
  });

  describe('getLikedReviewIdsByIds', () => {
    it('reviewIds가 비어있으면 빈 배열을 반환해야 한다', async () => {
      const result = await service.getLikedReviewIdsByIds(1, []);

      expect(result).toEqual([]);
      expect(mockReviewLikeRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('주어진 ID로 필터링된 좋아요한 리뷰 ID를 반환해야 한다', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ reviewId: 2 }, { reviewId: 4 }]),
      };
      mockReviewLikeRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getLikedReviewIdsByIds(1, [2, 4, 6]);

      expect(result).toEqual([2, 4]);
      expect(mockQb.where).toHaveBeenCalledWith('rl.userId = :userId', { userId: 1 });
      expect(mockQb.andWhere).toHaveBeenCalledWith('rl.reviewId IN (:...reviewIds)', { reviewIds: [2, 4, 6] });
    });
  });

  describe('findByContent', () => {
    it('최신순으로 정렬된 페이지네이션된 리뷰를 반환해야 한다', async () => {
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
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
    });

    it('좋아요순 정렬 옵션으로 호출해도 정상 동작해야 한다', async () => {
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findByContent(1, 1, 'likes');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('findByUser', () => {
    it('사용자에 대한 페이지네이션된 리뷰를 반환해야 한다', async () => {
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
    it('사용자와 콘텐츠가 포함된 최근 리뷰를 반환해야 한다', async () => {
      const mockReviews = [
        { id: 1, userId: 1, user: { id: 1, nickname: 'test' }, content: { id: 1 } },
      ];
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockReviews),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getRecentReviews(5);

      expect(result).toHaveLength(1);
      expect(mockQb.take).toHaveBeenCalledWith(5);
    });

    it('limit이 50을 초과하면 50으로 제한해야 한다', async () => {
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getRecentReviews(100);

      expect(mockQb.take).toHaveBeenCalledWith(50);
    });

    it('limit이 0 이하이면 1로 제한해야 한다', async () => {
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getRecentReviews(0);

      expect(mockQb.take).toHaveBeenCalledWith(1);
    });
  });

  describe('getContentStats', () => {
    it('평균 별점과 리뷰 수를 반환해야 한다', async () => {
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

    it('리뷰가 없으면 null 평균을 반환해야 한다', async () => {
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
    it('좋아요하지 않은 상태에서 좋아요를 추가해야 한다', async () => {
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
        (cb: (manager: EntityManager) => Promise<unknown>) => cb(mockManager as unknown as EntityManager),
      );
      mockReviewLikeRepo.create.mockReturnValue({ reviewId: 1, userId: 1 });

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(true);
      expect(result.likesCount).toBe(1);
    });

    it('이미 좋아요한 상태에서 좋아요를 제거해야 한다', async () => {
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
        (cb: (manager: EntityManager) => Promise<unknown>) => cb(mockManager as unknown as EntityManager),
      );

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(false);
      expect(result.likesCount).toBe(0);
    });

    it('좋아요 추가 후 수정된 리뷰가 null이면 likesCount 0을 반환해야 한다', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, likesCount: 0 });
      mockReviewLikeRepo.findOne.mockResolvedValue(null);

      const mockManager = {
        save: jest.fn(),
        remove: jest.fn(),
        findOne: jest.fn().mockResolvedValue(null),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        }),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) => cb(mockManager as unknown as EntityManager),
      );
      mockReviewLikeRepo.create.mockReturnValue({ reviewId: 1, userId: 1 });

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(true);
      expect(result.likesCount).toBe(0);
    });

    it('좋아요 제거 후 수정된 리뷰가 null이면 likesCount 0을 반환해야 한다', async () => {
      mockReviewRepo.findOne.mockResolvedValue({ id: 1, likesCount: 1 });
      mockReviewLikeRepo.findOne.mockResolvedValue({ id: 1, reviewId: 1, userId: 1 });

      const mockManager = {
        save: jest.fn(),
        remove: jest.fn(),
        findOne: jest.fn().mockResolvedValue(null),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        }),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) => cb(mockManager as unknown as EntityManager),
      );

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(false);
      expect(result.likesCount).toBe(0);
    });

    it('리뷰를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      mockReviewRepo.findOne.mockResolvedValue(null);

      await expect(service.toggleLike(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
