import { Test, TestingModule } from '@nestjs/testing';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';

describe('WatchlistController', () => {
  let controller: WatchlistController;

  const mockWatchlistService = {
    addToWatchlist: jest.fn(),
    updateStatus: jest.fn(),
    removeFromWatchlist: jest.fn(),
    getMyWatchlist: jest.fn(),
    getMyWatchlistCounts: jest.fn(),
    getWatchlistStatus: jest.fn(),
    getWatchlistStatusByTmdbId: jest.fn(),
    getWantToWatchAll: jest.fn(),
    getWatchedYears: jest.fn(),
    getWatchedByYear: jest.fn(),
  };

  const user = { id: 1, nickname: 'test', role: 'USER' };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-29T15:30:00.000Z'));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WatchlistController],
      providers: [
        { provide: WatchlistService, useValue: mockWatchlistService },
      ],
    }).compile();

    controller = module.get<WatchlistController>(WatchlistController);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('GET /watchlist/me', () => {
    it('기본 파라미터로 워치리스트를 반환해야 한다', async () => {
      const paginated = { items: [], total: 0, page: 1, totalPages: 0 };
      mockWatchlistService.getMyWatchlist.mockResolvedValue(paginated);

      await controller.getMyWatchlist(user);

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(
        1,
        'want_to_watch',
        1,
      );
    });

    it('status와 page 파라미터를 전달해야 한다', async () => {
      const paginated = { items: [], total: 0, page: 2, totalPages: 1 };
      mockWatchlistService.getMyWatchlist.mockResolvedValue(paginated);

      await controller.getMyWatchlist(user, 'watched', '2');

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(
        1,
        'watched',
        2,
      );
    });

    it('유효하지 않은 status에 대해 want_to_watch를 기본값으로 사용해야 한다', async () => {
      mockWatchlistService.getMyWatchlist.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });

      await controller.getMyWatchlist(user, 'invalid');

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(
        1,
        'want_to_watch',
        1,
      );
    });
  });

  describe('GET /watchlist/me/want-to-watch', () => {
    it('기본 limit 30, offset 0으로 want_to_watch 항목을 반환해야 한다', async () => {
      const data = { items: [{ id: 1 }, { id: 2 }], total: 2, hasMore: false };
      mockWatchlistService.getWantToWatchAll.mockResolvedValue(data);

      await controller.getWantToWatchAll(user);

      expect(mockWatchlistService.getWantToWatchAll).toHaveBeenCalledWith(
        1,
        30,
        0,
      );
    });

    it('limit과 offset을 전달해야 한다', async () => {
      const data = { items: [], total: 50, hasMore: true };
      mockWatchlistService.getWantToWatchAll.mockResolvedValue(data);

      await controller.getWantToWatchAll(user, '30', '30');

      expect(mockWatchlistService.getWantToWatchAll).toHaveBeenCalledWith(
        1,
        30,
        30,
      );
    });
  });

  describe('GET /watchlist/me/watched', () => {
    it('기본적으로 현재 연도의 감상 항목을 반환해야 한다', async () => {
      const currentYear = 2026;
      const response = { year: currentYear, totalCount: 3, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      await controller.getWatchedByYear(user);

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(
        1,
        currentYear,
      );
    });

    it('쿼리 파라미터에서 파싱된 연도를 전달해야 한다', async () => {
      const response = { year: 2025, totalCount: 5, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      await controller.getWatchedByYear(user, '2025');

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(
        1,
        2025,
      );
    });

    it('유효하지 않은 연도 문자열에 대해 현재 연도로 폴백해야 한다', async () => {
      const currentYear = 2026;
      const response = { year: currentYear, totalCount: 0, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      await controller.getWatchedByYear(user, 'invalid');

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(
        1,
        currentYear,
      );
    });

    it('범위를 벗어난 연도에 대해 현재 연도로 폴백해야 한다', async () => {
      const currentYear = 2026;
      mockWatchlistService.getWatchedByYear.mockResolvedValue({
        year: currentYear,
        totalCount: 0,
        months: [],
      });

      await controller.getWatchedByYear(user, '1800');

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(
        1,
        currentYear,
      );
    });
  });

  describe('GET /watchlist/me/status', () => {
    it('tmdbId로 워치리스트 상태를 반환해야 한다', async () => {
      const statusData = { status: 'watched', watchlistId: 1 };
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue(
        statusData,
      );

      const result = await controller.getWatchlistStatus(user, '550', 'movie');

      expect(result).toEqual(statusData);
      expect(
        mockWatchlistService.getWatchlistStatusByTmdbId,
      ).toHaveBeenCalledWith(1, 550, 'movie');
    });

    it('contentId로 워치리스트 상태를 반환해야 한다', async () => {
      const statusData = { status: 'watched', watchlistId: 1 };
      mockWatchlistService.getWatchlistStatus.mockResolvedValue(statusData);

      const result = await controller.getWatchlistStatus(
        user,
        undefined,
        undefined,
        '10',
      );

      expect(result).toEqual(statusData);
      expect(mockWatchlistService.getWatchlistStatus).toHaveBeenCalledWith(
        1,
        10,
      );
    });

    it('파라미터가 없으면 null을 반환해야 한다', async () => {
      const result = await controller.getWatchlistStatus(user);

      expect(result).toEqual({
        status: null,
        watchlistId: null,
        watchedAt: null,
      });
    });

    it('contentType이 tv이면 tv를 사용해야 한다', async () => {
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue({
        status: null,
        watchlistId: null,
      });

      await controller.getWatchlistStatus(user, '100', 'tv');

      expect(
        mockWatchlistService.getWatchlistStatusByTmdbId,
      ).toHaveBeenCalledWith(1, 100, 'tv');
    });
  });
});
