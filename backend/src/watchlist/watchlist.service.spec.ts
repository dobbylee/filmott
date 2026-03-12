import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { Watchlist } from './watchlist.entity';
import { ContentsService } from '../contents/contents.service';

describe('WatchlistService', () => {
  let service: WatchlistService;

  const mockWatchlistRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockContentsService = {
    findOrFetchByTmdbId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchlistService,
        { provide: getRepositoryToken(Watchlist), useValue: mockWatchlistRepo },
        { provide: ContentsService, useValue: mockContentsService },
      ],
    }).compile();

    service = module.get<WatchlistService>(WatchlistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addToWatchlist', () => {
    const dto = {
      tmdbId: 550,
      contentType: 'movie' as const,
      status: 'want_to_watch' as const,
    };

    it('should create a new watchlist entry', async () => {
      const content = { id: 1, tmdbId: 550, contentType: 'movie' };
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue(content);
      mockWatchlistRepo.findOne.mockResolvedValue(null);
      const created = { id: 1, userId: 1, contentId: 1, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.create.mockReturnValue(created);
      mockWatchlistRepo.save.mockResolvedValue(created);

      const result = await service.addToWatchlist(1, dto);

      expect(mockContentsService.findOrFetchByTmdbId).toHaveBeenCalledWith(550, 'movie');
      expect(mockWatchlistRepo.create).toHaveBeenCalledWith({
        userId: 1,
        contentId: 1,
        status: 'want_to_watch',
        watchedAt: null,
      });
      expect(result).toEqual(created);
    });

    it('should set watchedAt when status is watched', async () => {
      const content = { id: 1, tmdbId: 550, contentType: 'movie' };
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue(content);
      mockWatchlistRepo.findOne.mockResolvedValue(null);

      const watchedDto = { ...dto, status: 'watched' as const, watchedAt: '2026-03-10T00:00:00Z' };
      const created = { id: 1, userId: 1, contentId: 1, status: 'watched', watchedAt: new Date('2026-03-10T00:00:00Z') };
      mockWatchlistRepo.create.mockReturnValue(created);
      mockWatchlistRepo.save.mockResolvedValue(created);

      const result = await service.addToWatchlist(1, watchedDto);

      expect(mockWatchlistRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'watched',
          watchedAt: new Date('2026-03-10T00:00:00Z'),
        }),
      );
      expect(result.status).toBe('watched');
    });

    it('should update existing watchlist entry (upsert)', async () => {
      const content = { id: 1, tmdbId: 550, contentType: 'movie' };
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue(content);

      const existing = { id: 5, userId: 1, contentId: 1, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.findOne.mockResolvedValue(existing);
      mockWatchlistRepo.save.mockImplementation((item: any) => Promise.resolve(item));

      const watchedDto = { ...dto, status: 'watched' as const };
      const result = await service.addToWatchlist(1, watchedDto);

      expect(result.status).toBe('watched');
      expect(result.watchedAt).toBeInstanceOf(Date);
      expect(mockWatchlistRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update status from want_to_watch to watched', async () => {
      const item = { id: 1, userId: 1, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { status: 'watched' });

      expect(result.status).toBe('watched');
      expect(result.watchedAt).toBeInstanceOf(Date);
    });

    it('should set watchedAt to null when changing to want_to_watch', async () => {
      const item = { id: 1, userId: 1, status: 'watched', watchedAt: new Date() };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { status: 'want_to_watch' });

      expect(result.status).toBe('want_to_watch');
      expect(result.watchedAt).toBeNull();
    });

    it('should update watchedAt when only watchedAt is provided for watched item', async () => {
      const item = { id: 1, userId: 1, status: 'watched', watchedAt: new Date('2026-01-01') };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { watchedAt: '2026-03-10T00:00:00Z' });

      expect(result.watchedAt).toEqual(new Date('2026-03-10T00:00:00Z'));
    });

    it('should throw NotFoundException when item not found', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);

      await expect(service.updateStatus(1, 999, { status: 'watched' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not the owner', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.updateStatus(1, 1, { status: 'watched' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('removeFromWatchlist', () => {
    it('should remove the watchlist item', async () => {
      const item = { id: 1, userId: 1 };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.remove.mockResolvedValue(item);

      await service.removeFromWatchlist(1, 1);

      expect(mockWatchlistRepo.remove).toHaveBeenCalledWith(item);
    });

    it('should throw NotFoundException when item not found', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);

      await expect(service.removeFromWatchlist(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not the owner', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.removeFromWatchlist(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMyWatchlist', () => {
    it('should return paginated watchlist with content', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 1, contentId: 1, status: 'want_to_watch', content: { id: 1, title: 'Movie' } }],
          1,
        ]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getMyWatchlist(1, 'want_to_watch', 1);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should LEFT JOIN review when status is watched', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getMyWatchlist(1, 'watched', 1);

      expect(mockQb.leftJoinAndMapOne).toHaveBeenCalledWith(
        'w.review',
        'Review',
        'review',
        'review.userId = w.userId AND review.contentId = w.contentId',
      );
      expect(mockQb.loadRelationCountAndMap).toHaveBeenCalledWith(
        'review.commentsCount',
        'review.comments',
      );
    });

    it('should NOT JOIN review when status is want_to_watch', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getMyWatchlist(1, 'want_to_watch', 1);

      expect(mockQb.leftJoinAndMapOne).not.toHaveBeenCalled();
    });

    it('should handle pagination correctly', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 50]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getMyWatchlist(1, 'watched', 2);

      expect(mockQb.skip).toHaveBeenCalledWith(20);
      expect(mockQb.take).toHaveBeenCalledWith(20);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('getMyWatchlistCounts', () => {
    it('should return correct counts', async () => {
      mockWatchlistRepo.count
        .mockResolvedValueOnce(5)  // watched
        .mockResolvedValueOnce(3); // want_to_watch

      const result = await service.getMyWatchlistCounts(1);

      expect(result).toEqual({ watchedCount: 5, wantToWatchCount: 3 });
      expect(mockWatchlistRepo.count).toHaveBeenCalledTimes(2);
    });
  });

  describe('getWatchlistStatus', () => {
    it('should return status when item exists', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue({ id: 1, status: 'watched' });

      const result = await service.getWatchlistStatus(1, 1);

      expect(result).toEqual({ status: 'watched', watchlistId: 1 });
    });

    it('should return null when item does not exist', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);

      const result = await service.getWatchlistStatus(1, 999);

      expect(result).toEqual({ status: null, watchlistId: null });
    });
  });

  describe('getWatchlistStatusByTmdbId', () => {
    it('should return status when found via tmdbId', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 1, status: 'want_to_watch' }),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWatchlistStatusByTmdbId(1, 550, 'movie');

      expect(result).toEqual({ status: 'want_to_watch', watchlistId: 1 });
    });

    it('should return null when content not in watchlist', async () => {
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWatchlistStatusByTmdbId(1, 999, 'movie');

      expect(result).toEqual({ status: null, watchlistId: null });
    });
  });

  describe('getWantToWatchAll', () => {
    it('should return all want_to_watch items without pagination', async () => {
      const items = [
        { id: 1, status: 'want_to_watch', content: { id: 1, title: 'Movie A' } },
        { id: 2, status: 'want_to_watch', content: { id: 2, title: 'Movie B' } },
      ];
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(items),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWantToWatchAll(1);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'w.status = :status',
        { status: 'want_to_watch' },
      );
    });

    it('should return empty list when no want_to_watch items', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWantToWatchAll(1);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getWatchedYears', () => {
    it('should return distinct years from watched items', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { year: '2026' },
          { year: '2025' },
          { year: '2024' },
        ]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWatchedYears(1);

      expect(result.years).toEqual([2026, 2025, 2024]);
      // N10: TypeORM 프로퍼티명 사용 확인 (raw SQL 컬럼명 아님)
      expect(mockQb.select).toHaveBeenCalledWith(
        'DISTINCT EXTRACT(YEAR FROM COALESCE(w.watchedAt, w.updatedAt))',
        'year',
      );
      expect(mockQb.where).toHaveBeenCalledWith(
        'w.userId = :userId',
        { userId: 1 },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'w.status = :status',
        { status: 'watched' },
      );
    });

    it('should return empty years when no watched items', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWatchedYears(1);

      expect(result.years).toEqual([]);
    });
  });

  describe('getWatchedByYear', () => {
    it('should return items grouped by month for a given year', async () => {
      const items = [
        {
          id: 1,
          status: 'watched',
          watchedAt: new Date('2026-03-15'),
          updatedAt: new Date('2026-03-15'),
          content: { id: 1, title: 'Movie A' },
        },
        {
          id: 2,
          status: 'watched',
          watchedAt: new Date('2026-03-05'),
          updatedAt: new Date('2026-03-05'),
          content: { id: 2, title: 'Movie B' },
        },
        {
          id: 3,
          status: 'watched',
          watchedAt: new Date('2026-01-20'),
          updatedAt: new Date('2026-01-20'),
          content: { id: 3, title: 'Movie C' },
        },
      ];
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(items),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWatchedByYear(1, 2026);

      expect(result.year).toBe(2026);
      expect(result.totalCount).toBe(3);
      expect(result.months).toHaveLength(2); // March and January
      // months sorted newest first: March(3) > January(1)
      expect(result.months[0].month).toBe(3);
      expect(result.months[0].count).toBe(2);
      expect(result.months[1].month).toBe(1);
      expect(result.months[1].count).toBe(1);
    });

    it('should use updatedAt when watchedAt is null', async () => {
      const items = [
        {
          id: 1,
          status: 'watched',
          watchedAt: null,
          updatedAt: new Date('2026-02-10'),
          content: { id: 1, title: 'Movie A' },
        },
      ];
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(items),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWatchedByYear(1, 2026);

      expect(result.totalCount).toBe(1);
      expect(result.months[0].month).toBe(2); // February
    });

    it('should return empty months when no items in that year', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWatchedByYear(1, 2020);

      expect(result.year).toBe(2020);
      expect(result.totalCount).toBe(0);
      expect(result.months).toHaveLength(0);
    });

    it('should query with correct date range for the given year', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWatchedByYear(1, 2025);

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'COALESCE(w.watchedAt, w.updatedAt) >= :startDate',
        { startDate: new Date(2025, 0, 1) },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'COALESCE(w.watchedAt, w.updatedAt) < :endDate',
        { endDate: new Date(2026, 0, 1) },
      );
    });
  });
});
