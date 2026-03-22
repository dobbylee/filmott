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

    it('새 워치리스트 항목을 생성해야 한다', async () => {
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

    it('status가 watched이면 watchedAt을 설정해야 한다', async () => {
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

    it('기존 워치리스트 항목을 업데이트해야 한다 (upsert)', async () => {
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

    it('기존 watched 항목에서 watchedAt이 주어지면 해당 날짜로 업데이트해야 한다', async () => {
      const content = { id: 1, tmdbId: 550, contentType: 'movie' };
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue(content);

      const existing = { id: 5, userId: 1, contentId: 1, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.findOne.mockResolvedValue(existing);
      mockWatchlistRepo.save.mockImplementation((item: any) => Promise.resolve(item));

      const watchedDto = { ...dto, status: 'watched' as const, watchedAt: '2026-01-15T00:00:00Z' };
      const result = await service.addToWatchlist(1, watchedDto);

      expect(result.status).toBe('watched');
      expect(result.watchedAt).toEqual(new Date('2026-01-15T00:00:00Z'));
    });

    it('기존 항목을 want_to_watch로 업데이트하면 watchedAt이 null이어야 한다', async () => {
      const content = { id: 1, tmdbId: 550, contentType: 'movie' };
      mockContentsService.findOrFetchByTmdbId.mockResolvedValue(content);

      const existing = { id: 5, userId: 1, contentId: 1, status: 'watched', watchedAt: new Date() };
      mockWatchlistRepo.findOne.mockResolvedValue(existing);
      mockWatchlistRepo.save.mockImplementation((item: any) => Promise.resolve(item));

      const wantDto = { ...dto, status: 'want_to_watch' as const };
      const result = await service.addToWatchlist(1, wantDto);

      expect(result.status).toBe('want_to_watch');
      expect(result.watchedAt).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('want_to_watch에서 watched로 상태를 업데이트해야 한다', async () => {
      const item = { id: 1, userId: 1, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { status: 'watched' });

      expect(result.status).toBe('watched');
      expect(result.watchedAt).toBeInstanceOf(Date);
    });

    it('want_to_watch로 변경 시 watchedAt을 null로 설정해야 한다', async () => {
      const item = { id: 1, userId: 1, status: 'watched', watchedAt: new Date() };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { status: 'want_to_watch' });

      expect(result.status).toBe('want_to_watch');
      expect(result.watchedAt).toBeNull();
    });

    it('watched 항목에 watchedAt만 제공되면 watchedAt을 업데이트해야 한다', async () => {
      const item = { id: 1, userId: 1, status: 'watched', watchedAt: new Date('2026-01-01') };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { watchedAt: '2026-03-10T00:00:00Z' });

      expect(result.watchedAt).toEqual(new Date('2026-03-10T00:00:00Z'));
    });

    it('항목을 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);

      await expect(service.updateStatus(1, 999, { status: 'watched' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('소유자가 아니면 ForbiddenException을 던져야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.updateStatus(1, 1, { status: 'watched' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('watched 상태에서 watchedAt을 지정하면 해당 날짜로 설정해야 한다', async () => {
      const item = { id: 1, userId: 1, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { status: 'watched', watchedAt: '2026-06-15T00:00:00Z' });

      expect(result.status).toBe('watched');
      expect(result.watchedAt).toEqual(new Date('2026-06-15T00:00:00Z'));
    });

    it('status 없이 watchedAt만 주어지고 want_to_watch 상태이면 변경하지 않아야 한다', async () => {
      const item = { id: 1, userId: 1, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.save.mockImplementation((i: any) => Promise.resolve(i));

      const result = await service.updateStatus(1, 1, { watchedAt: '2026-06-15T00:00:00Z' });

      expect(result.status).toBe('want_to_watch');
      expect(result.watchedAt).toBeNull();
    });
  });

  describe('removeFromWatchlist', () => {
    it('워치리스트 항목을 제거해야 한다', async () => {
      const item = { id: 1, userId: 1 };
      mockWatchlistRepo.findOne.mockResolvedValue(item);
      mockWatchlistRepo.remove.mockResolvedValue(item);

      await service.removeFromWatchlist(1, 1);

      expect(mockWatchlistRepo.remove).toHaveBeenCalledWith(item);
    });

    it('항목을 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);

      await expect(service.removeFromWatchlist(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('소유자가 아니면 ForbiddenException을 던져야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });

      await expect(service.removeFromWatchlist(1, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMyWatchlist', () => {
    it('콘텐츠가 포함된 페이지네이션된 워치리스트를 반환해야 한다', async () => {
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

    it('status가 watched일 때 review를 LEFT JOIN해야 한다', async () => {
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

      expect(mockQb.leftJoinAndMapOne).toHaveBeenCalled();
      expect(mockQb.loadRelationCountAndMap).toHaveBeenCalled();
    });

    it('status가 want_to_watch일 때 review를 JOIN하지 않아야 한다', async () => {
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

    it('페이지네이션을 올바르게 처리해야 한다', async () => {
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
    it('올바른 카운트를 반환해야 한다', async () => {
      mockWatchlistRepo.count
        .mockResolvedValueOnce(5)  // watched
        .mockResolvedValueOnce(3); // want_to_watch

      const result = await service.getMyWatchlistCounts(1);

      expect(result).toEqual({ watchedCount: 5, wantToWatchCount: 3 });
      expect(mockWatchlistRepo.count).toHaveBeenCalledTimes(2);
    });
  });

  describe('getWatchlistStatus', () => {
    it('항목이 존재하면 상태를 반환해야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue({ id: 1, status: 'watched' });

      const result = await service.getWatchlistStatus(1, 1);

      expect(result).toEqual({ status: 'watched', watchlistId: 1 });
    });

    it('항목이 존재하지 않으면 null을 반환해야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);

      const result = await service.getWatchlistStatus(1, 999);

      expect(result).toEqual({ status: null, watchlistId: null });
    });
  });

  describe('getWatchlistStatusByTmdbId', () => {
    it('tmdbId로 찾은 경우 상태를 반환해야 한다', async () => {
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

    it('워치리스트에 콘텐츠가 없으면 null을 반환해야 한다', async () => {
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
    const createWantToWatchQb = (items: any[] = [], total = 0) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([items, total]),
    });

    it('want_to_watch 항목을 반환해야 한다', async () => {
      const items = [
        { id: 1, status: 'want_to_watch', content: { id: 1, title: 'Movie A' } },
        { id: 2, status: 'want_to_watch', content: { id: 2, title: 'Movie B' } },
      ];
      const mockQb = createWantToWatchQb(items, 2);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWantToWatchAll(1);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'w.status = :status',
        { status: 'want_to_watch' },
      );
      expect(mockQb.take).toHaveBeenCalledWith(30);
    });

    it('want_to_watch 항목이 없으면 빈 목록을 반환해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWantToWatchAll(1);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('기본 limit 30, offset 0으로 조회해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1);

      expect(mockQb.take).toHaveBeenCalledWith(30);
      expect(mockQb.skip).toHaveBeenCalledWith(0);
    });

    it('limit을 지정하면 해당 값으로 조회해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1, 50);

      expect(mockQb.take).toHaveBeenCalledWith(50);
    });

    it('limit이 100을 초과하면 100으로 제한해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1, 500);

      expect(mockQb.take).toHaveBeenCalledWith(100);
    });

    it('limit이 0 이하이면 1로 보정해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1, 0);

      expect(mockQb.take).toHaveBeenCalledWith(1);
    });

    it('음수 limit이면 1로 보정해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1, -10);

      expect(mockQb.take).toHaveBeenCalledWith(1);
    });

    it('limit이 경계값 100일 때 정확히 100으로 조회해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1, 100);

      expect(mockQb.take).toHaveBeenCalledWith(100);
    });

    it('offset을 지정하면 해당 값으로 skip해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1, 30, 60);

      expect(mockQb.skip).toHaveBeenCalledWith(60);
    });

    it('음수 offset이면 0으로 보정해야 한다', async () => {
      const mockQb = createWantToWatchQb([], 0);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getWantToWatchAll(1, 30, -5);

      expect(mockQb.skip).toHaveBeenCalledWith(0);
    });

    it('더 많은 항목이 있으면 hasMore가 true여야 한다', async () => {
      const items = [{ id: 1, status: 'want_to_watch' }];
      const mockQb = createWantToWatchQb(items, 50);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWantToWatchAll(1, 30, 0);

      expect(result.hasMore).toBe(true);
    });

    it('모든 항목을 불러왔으면 hasMore가 false여야 한다', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      const mockQb = createWantToWatchQb(items, 10);
      mockWatchlistRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getWantToWatchAll(1, 30, 0);

      expect(result.hasMore).toBe(false);
    });
  });

  describe('getWatchedYears', () => {
    it('감상 항목에서 중복 없는 연도를 반환해야 한다', async () => {
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
      expect(mockQb.where).toHaveBeenCalledWith(
        'w.userId = :userId',
        { userId: 1 },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'w.status = :status',
        { status: 'watched' },
      );
    });

    it('감상 항목이 없으면 빈 연도를 반환해야 한다', async () => {
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
    it('주어진 연도에 대해 월별로 그룹화된 항목을 반환해야 한다', async () => {
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

    it('watchedAt이 null이면 updatedAt을 사용해야 한다', async () => {
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

    it('해당 연도에 항목이 없으면 빈 months를 반환해야 한다', async () => {
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

    it('주어진 연도에 대해 올바른 날짜 범위로 조회해야 한다', async () => {
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

  describe('addToWatchlistByContentId', () => {
    it('존재하지 않으면 새 워치리스트 항목을 생성해야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);
      const created = { id: 10, userId: 1, contentId: 5, status: 'watched', watchedAt: expect.any(Date) };
      mockWatchlistRepo.create.mockReturnValue(created);
      mockWatchlistRepo.save.mockResolvedValue(created);

      const result = await service.addToWatchlistByContentId(1, 5, 'watched');

      expect(mockWatchlistRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 1, contentId: 5 },
      });
      expect(mockWatchlistRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          contentId: 5,
          status: 'watched',
        }),
      );
      expect(result).toEqual(created);
    });

    it('새 항목에서 status가 want_to_watch이면 watchedAt을 null로 설정해야 한다', async () => {
      mockWatchlistRepo.findOne.mockResolvedValue(null);
      const created = { id: 11, userId: 1, contentId: 5, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.create.mockReturnValue(created);
      mockWatchlistRepo.save.mockResolvedValue(created);

      await service.addToWatchlistByContentId(1, 5, 'want_to_watch');

      expect(mockWatchlistRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'want_to_watch',
          watchedAt: null,
        }),
      );
    });

    it('기존 워치리스트 항목을 업데이트해야 한다', async () => {
      const existing = { id: 5, userId: 1, contentId: 5, status: 'want_to_watch', watchedAt: null };
      mockWatchlistRepo.findOne.mockResolvedValue(existing);
      mockWatchlistRepo.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.addToWatchlistByContentId(1, 5, 'watched');

      expect(result.status).toBe('watched');
      expect(result.watchedAt).toBeInstanceOf(Date);
      expect(mockWatchlistRepo.create).not.toHaveBeenCalled();
    });

    it('기존 항목을 want_to_watch로 업데이트 시 watchedAt을 null로 설정해야 한다', async () => {
      const existing = { id: 5, userId: 1, contentId: 5, status: 'watched', watchedAt: new Date() };
      mockWatchlistRepo.findOne.mockResolvedValue(existing);
      mockWatchlistRepo.save.mockImplementation((item: any) => Promise.resolve(item));

      const result = await service.addToWatchlistByContentId(1, 5, 'want_to_watch');

      expect(result.status).toBe('want_to_watch');
      expect(result.watchedAt).toBeNull();
    });
  });
});
