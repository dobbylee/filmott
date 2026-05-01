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
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import { RevalidateService } from '../common/revalidate.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  const recentReviewsTags = ['recent-reviews'];
  const safeUserSelect = [
    'user.id',
    'user.nickname',
    'user.profileImage',
    'user.status',
  ];
  const sensitiveUserSelect = [
    'user.email',
    'user.provider',
    'user.providerId',
    'user.role',
    'user.subscribedOtts',
    'user.password',
  ];
  const expectSafeUserSelect = (addSelect: jest.Mock) => {
    const selectedColumns = addSelect.mock.calls.flatMap(
      ([columns]: [string[]]) => columns,
    );

    expect(selectedColumns).toEqual(expect.arrayContaining(safeUserSelect));
    expect(selectedColumns).toEqual(
      expect.not.arrayContaining(sensitiveUserSelect),
    );
  };

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
    addToWatchlistByContentIdWithManager: jest.fn(),
  };

  const mockRevalidateService = {
    revalidatePath: jest.fn().mockResolvedValue(undefined),
  };

  const mockUsersService = {
    findByIdWithStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        {
          provide: getRepositoryToken(ReviewLike),
          useValue: mockReviewLikeRepo,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: WatchlistService, useValue: mockWatchlistService },
        { provide: RevalidateService, useValue: mockRevalidateService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    mockUsersService.findByIdWithStatus.mockResolvedValue({
      id: 1,
      nickname: 'test',
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
      profileImage: null,
      subscribedOtts: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createManager = ({
      existingReview = null,
      existingWatchlist = null,
      createdReview,
    }: {
      existingReview?: Partial<Review> | null;
      existingWatchlist?: { status: 'watched' | 'want_to_watch' } | null;
      createdReview: Review;
    }) => ({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(existingReview)
        .mockResolvedValueOnce(existingWatchlist),
      create: jest.fn().mockReturnValue(createdReview),
      save: jest.fn().mockResolvedValue(createdReview),
    });

    it('별점과 코멘트로 리뷰를 생성해야 한다', async () => {
      const dto = { contentId: 1, rating: 8, comment: 'Great movie!' };
      const created = { id: 1, userId: 1, ...dto, likesCount: 0 };
      const mockManager = createManager({ createdReview: created as Review });
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      const result = await service.create(1, dto);

      expect(mockManager.create).toHaveBeenCalledWith(Review, {
        userId: 1,
        contentId: 1,
        rating: 8,
        comment: 'Great movie!',
      });
      expect(result).toEqual(created);
      expect(
        mockWatchlistService.addToWatchlistByContentIdWithManager,
      ).toHaveBeenCalledWith(mockManager, 1, 1, 'watched', undefined);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith(
        '/',
        recentReviewsTags,
      );
    });

    it('별점만으로 리뷰를 생성해야 한다', async () => {
      const dto = { contentId: 1, rating: 7 };
      const created = { id: 2, userId: 1, ...dto, likesCount: 0 };
      const mockManager = createManager({ createdReview: created as Review });
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      const result = await service.create(1, dto);
      expect(result.id).toBe(2);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith(
        '/',
        recentReviewsTags,
      );
    });

    it('DTO를 통해 코멘트만으로 리뷰를 생성해야 한다 - rating은 파이프 레벨에서 검증', async () => {
      const dto = { contentId: 1, rating: 5, comment: '좋아요' };
      const created = { id: 3, userId: 1, ...dto, likesCount: 0 };
      const mockManager = createManager({ createdReview: created as Review });
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      const result = await service.create(1, dto);
      expect(result.rating).toBe(5);
    });

    it('이미 감상한 경우 워치리스트에 추가하지 않아야 한다', async () => {
      const dto = { contentId: 1, rating: 8 };
      const created = { id: 4, userId: 1, ...dto, likesCount: 0 };
      const mockManager = createManager({
        createdReview: created as Review,
        existingWatchlist: { status: 'watched' },
      });
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );

      await service.create(1, dto);
      expect(
        mockWatchlistService.addToWatchlistByContentIdWithManager,
      ).not.toHaveBeenCalled();
    });

    it('이미 감상한 경우에도 watchedAt이 주어지면 워치리스트 날짜를 갱신해야 한다', async () => {
      const dto = {
        contentId: 1,
        rating: 8,
        watchedAt: '2026-03-15T00:00:00Z',
      };
      const created = { id: 7, userId: 1, ...dto, likesCount: 0 };
      const mockManager = createManager({
        createdReview: created as Review,
        existingWatchlist: { status: 'watched' },
      });
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      await service.create(1, dto);

      expect(
        mockWatchlistService.addToWatchlistByContentIdWithManager,
      ).toHaveBeenCalledWith(
        mockManager,
        1,
        1,
        'watched',
        '2026-03-15T00:00:00Z',
      );
    });

    it('리뷰 생성 시 want_to_watch를 watched로 전환해야 한다', async () => {
      const dto = { contentId: 1, rating: 9 };
      const created = { id: 5, userId: 1, ...dto, likesCount: 0 };
      const mockManager = createManager({
        createdReview: created as Review,
        existingWatchlist: { status: 'want_to_watch' },
      });
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      await service.create(1, dto);
      expect(
        mockWatchlistService.addToWatchlistByContentIdWithManager,
      ).toHaveBeenCalledWith(mockManager, 1, 1, 'watched', undefined);
    });

    it('워치리스트 저장이 실패하면 리뷰 생성도 롤백해야 한다', async () => {
      const dto = { contentId: 1, rating: 6 };
      const created = { id: 6, userId: 1, ...dto, likesCount: 0 };
      const mockManager = createManager({ createdReview: created as Review });
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockRejectedValue(
        new Error('watchlist failed'),
      );

      await expect(service.create(1, dto)).rejects.toThrow('watchlist failed');
      expect(mockRevalidateService.revalidatePath).not.toHaveBeenCalled();
    });

    it('리뷰가 이미 존재하면 ConflictException을 던져야 한다', async () => {
      const dto = { contentId: 1, rating: 8 };
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 1, userId: 1, contentId: 1 }),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );

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
        save: jest
          .fn()
          .mockImplementation((r: Partial<Review>) => Promise.resolve(r)),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );

      const result = await service.update(1, 1, { rating: 9 });

      expect(result.rating).toBe(9);
      expect(result.likesCount).toBe(0);
      expect(mockManager.delete).toHaveBeenCalledWith(expect.anything(), {
        reviewId: 1,
      });
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith(
        '/',
        recentReviewsTags,
      );
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
        save: jest
          .fn()
          .mockImplementation((r: Partial<Review>) => Promise.resolve(r)),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );

      const result = await service.update(1, 1, { comment: 'Updated comment' });

      expect(result.comment).toBe('Updated comment');
      expect(result.rating).toBe(7);
      expect(result.likesCount).toBe(0);
      expect(mockManager.delete).toHaveBeenCalledWith(expect.anything(), {
        reviewId: 1,
      });
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
        save: jest
          .fn()
          .mockImplementation((r: Partial<Review>) => Promise.resolve(r)),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );

      const result = await service.update(1, 1, {
        rating: 9,
        comment: 'New comment',
      });

      expect(result.rating).toBe(9);
      expect(result.comment).toBe('New comment');
      expect(result.likesCount).toBe(0);
      expect(mockManager.delete).toHaveBeenCalledWith(expect.anything(), {
        reviewId: 1,
      });
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
      mockReviewRepo.save.mockImplementation((r: Partial<Review>) =>
        Promise.resolve(r),
      );

      const result = await service.update(1, 1, { rating: 7, comment: 'Good' });

      expect(result.rating).toBe(7);
      expect(result.likesCount).toBe(10);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith(
        '/',
        recentReviewsTags,
      );
    });

    it('watchedAt만 변경하면 워치리스트 날짜를 갱신하고 좋아요를 유지해야 한다', async () => {
      const watchedAt = '2026-04-20T00:00:00.000Z';
      const review = {
        id: 1,
        userId: 1,
        contentId: 5,
        rating: 7,
        comment: 'Good',

        likesCount: 10,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      const mockManager = {
        delete: jest.fn(),
        save: jest.fn(),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      const result = await service.update(1, 1, { watchedAt });

      expect(result.likesCount).toBe(10);
      expect(mockManager.delete).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(mockReviewRepo.save).not.toHaveBeenCalled();
      expect(
        mockWatchlistService.addToWatchlistByContentIdWithManager,
      ).toHaveBeenCalledWith(mockManager, 1, 5, 'watched', watchedAt);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith(
        '/',
        recentReviewsTags,
      );
    });

    it('rating과 코멘트가 동일하고 watchedAt만 변경되면 좋아요를 유지해야 한다', async () => {
      const watchedAt = '2026-04-21T00:00:00.000Z';
      const review = {
        id: 1,
        userId: 1,
        contentId: 5,
        rating: 7,
        comment: 'Good',

        likesCount: 10,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      const mockManager = {
        delete: jest.fn(),
        save: jest.fn(),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      const result = await service.update(1, 1, {
        rating: 7,
        comment: 'Good',
        watchedAt,
      });

      expect(result.likesCount).toBe(10);
      expect(mockManager.delete).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(
        mockWatchlistService.addToWatchlistByContentIdWithManager,
      ).toHaveBeenCalledWith(mockManager, 1, 5, 'watched', watchedAt);
    });

    it('리뷰 내용과 watchedAt을 함께 변경하면 좋아요 초기화와 워치리스트 갱신을 같은 트랜잭션에서 처리해야 한다', async () => {
      const watchedAt = '2026-04-22T00:00:00.000Z';
      const review = {
        id: 1,
        userId: 1,
        contentId: 5,
        rating: 7,
        comment: 'Good',

        likesCount: 10,
      };
      mockReviewRepo.findOne.mockResolvedValue({ ...review });

      const mockManager = {
        delete: jest.fn().mockResolvedValue({ affected: 10 }),
        save: jest
          .fn()
          .mockImplementation((r: Partial<Review>) => Promise.resolve(r)),
      };
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(mockManager as unknown as EntityManager),
      );
      mockWatchlistService.addToWatchlistByContentIdWithManager.mockResolvedValue(
        {},
      );

      const result = await service.update(1, 1, {
        rating: 9,
        watchedAt,
      });

      expect(result.rating).toBe(9);
      expect(result.likesCount).toBe(0);
      expect(mockManager.delete).toHaveBeenCalledWith(expect.anything(), {
        reviewId: 1,
      });
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, rating: 9, likesCount: 0 }),
      );
      expect(
        mockWatchlistService.addToWatchlistByContentIdWithManager,
      ).toHaveBeenCalledWith(mockManager, 1, 5, 'watched', watchedAt);
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
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith(
        '/',
        recentReviewsTags,
      );
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
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith(
        '/',
        recentReviewsTags,
      );
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
      const review = {
        id: 1,
        userId: 1,
        contentId: 5,
        rating: 8,
        commentsCount: 3,
      };
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
      expectSafeUserSelect(mockQb.addSelect);
      expect(mockQb.where).toHaveBeenCalledWith('review.userId = :userId', {
        userId: 1,
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'review.contentId = :contentId',
        { contentId: 5 },
      );
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
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ reviewId: 1 }, { reviewId: 3 }]),
      };
      mockReviewLikeRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getLikedReviewIds(1, 5);

      expect(result).toEqual([1, 3]);
      expect(mockQb.where).toHaveBeenCalledWith('rl.userId = :userId', {
        userId: 1,
      });
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
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ reviewId: 2 }, { reviewId: 4 }]),
      };
      mockReviewLikeRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getLikedReviewIdsByIds(1, [2, 4, 6]);

      expect(result).toEqual([2, 4]);
      expect(mockQb.where).toHaveBeenCalledWith('rl.userId = :userId', {
        userId: 1,
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'rl.reviewId IN (:...reviewIds)',
        { reviewIds: [2, 4, 6] },
      );
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
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[{ id: 1, userId: 1, rating: 8 }], 1]),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findByContent(1, 1, 'latest');

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expectSafeUserSelect(mockQb.addSelect);
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
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[{ id: 1, userId: 1, contentId: 1 }], 1]),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findByUser(1, 1);

      expect(mockUsersService.findByIdWithStatus).toHaveBeenCalledWith(1);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockQb.leftJoinAndSelect).toHaveBeenCalledWith(
        'review.content',
        'content',
      );
      expectSafeUserSelect(mockQb.addSelect);
      expect(mockQb.loadRelationCountAndMap).toHaveBeenCalledWith(
        'review.commentsCount',
        'review.comments',
      );
      expect(mockReviewRepo.findAndCount).not.toHaveBeenCalled();
    });

    it('정지된 사용자의 공개 리뷰 목록은 빈 결과를 반환해야 한다', async () => {
      mockUsersService.findByIdWithStatus.mockResolvedValue({
        id: 1,
        nickname: 'blocked',
        status: UserStatus.SUSPENDED,
        role: UserRole.USER,
        profileImage: null,
        subscribedOtts: [],
      });

      const result = await service.findByUser(1, 1, 10);

      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });
      expect(mockReviewRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('탈퇴했거나 존재하지 않는 사용자의 공개 리뷰 목록은 빈 결과를 반환해야 한다', async () => {
      mockUsersService.findByIdWithStatus.mockResolvedValue(null);

      const result = await service.findByUser(99, 2, 10);

      expect(result).toEqual({
        data: [],
        total: 0,
        page: 2,
        totalPages: 0,
      });
      expect(mockReviewRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getRecentReviews', () => {
    it('사용자와 콘텐츠가 포함된 최근 리뷰를 반환해야 한다', async () => {
      const mockReviews = [
        {
          id: 1,
          userId: 1,
          user: { id: 1, nickname: 'test' },
          content: { id: 1 },
        },
      ];
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockReviews),
      };
      mockReviewRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getRecentReviews(5);

      expect(result).toHaveLength(1);
      expectSafeUserSelect(mockQb.addSelect);
      expect(mockQb.where).toHaveBeenCalledWith('content.adult IS NOT TRUE');
      expect(mockQb.take).toHaveBeenCalledWith(5);
    });

    it('limit이 50을 초과하면 50으로 제한해야 한다', async () => {
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
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
        where: jest.fn().mockReturnThis(),
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
    const createToggleManager = ({
      review = { id: 1, likesCount: 0 },
      existingLike = null,
      updatedReview = { id: 1, likesCount: 1 },
    }: {
      review?: Partial<Review> | null;
      existingLike?: Partial<ReviewLike> | null;
      updatedReview?: Partial<Review> | null;
    }) => {
      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(review)
          .mockResolvedValueOnce(existingLike)
          .mockResolvedValueOnce(updatedReview),
        create: jest.fn().mockReturnValue({ reviewId: 1, userId: 1 }),
        save: jest.fn().mockResolvedValue({}),
        remove: jest.fn().mockResolvedValue({}),
        createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      };

      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => Promise<unknown>) =>
          cb(manager as unknown as EntityManager),
      );

      return { manager, updateBuilder };
    };

    it('좋아요하지 않은 상태에서 좋아요를 추가해야 한다', async () => {
      const { manager, updateBuilder } = createToggleManager({
        existingLike: null,
        updatedReview: { id: 1, likesCount: 1 },
      });

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(true);
      expect(result.likesCount).toBe(1);
      expect(manager.findOne).toHaveBeenNthCalledWith(1, Review, {
        where: { id: 1 },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.findOne).toHaveBeenNthCalledWith(2, ReviewLike, {
        where: { reviewId: 1, userId: 1 },
      });
      expect(manager.create).toHaveBeenCalledWith(ReviewLike, {
        reviewId: 1,
        userId: 1,
      });
      expect(manager.save).toHaveBeenCalledWith({ reviewId: 1, userId: 1 });
      expect(updateBuilder.set).toHaveBeenCalled();
      const setArg = updateBuilder.set.mock.calls[0][0] as {
        likesCount: () => string;
      };
      expect(setArg.likesCount()).toBe('likes_count + 1');
    });

    it('이미 좋아요한 상태에서 좋아요를 제거해야 한다', async () => {
      const existingLike = { id: 1, reviewId: 1, userId: 1 };
      const { manager, updateBuilder } = createToggleManager({
        review: { id: 1, likesCount: 1 },
        existingLike,
        updatedReview: { id: 1, likesCount: 0 },
      });

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(false);
      expect(result.likesCount).toBe(0);
      expect(manager.remove).toHaveBeenCalledWith(existingLike);
      const setArg = updateBuilder.set.mock.calls[0][0] as {
        likesCount: () => string;
      };
      expect(setArg.likesCount()).toBe('GREATEST(likes_count - 1, 0)');
    });

    it('좋아요 추가 후 수정된 리뷰가 null이면 likesCount 0을 반환해야 한다', async () => {
      createToggleManager({
        existingLike: null,
        updatedReview: null,
      });

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(true);
      expect(result.likesCount).toBe(0);
    });

    it('좋아요 제거 후 수정된 리뷰가 null이면 likesCount 0을 반환해야 한다', async () => {
      createToggleManager({
        review: { id: 1, likesCount: 1 },
        existingLike: { id: 1, reviewId: 1, userId: 1 },
        updatedReview: null,
      });

      const result = await service.toggleLike(1, 1);

      expect(result.liked).toBe(false);
      expect(result.likesCount).toBe(0);
    });

    it('리뷰를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      const { manager } = createToggleManager({ review: null });

      await expect(service.toggleLike(1, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
