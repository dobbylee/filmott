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
    getWatchlistStatusByTmdbId: jest.fn(),
    getWantToWatchAll: jest.fn(),
    getWatchedYears: jest.fn(),
    getWatchedByYear: jest.fn(),
  };

  const user = { id: 1, nickname: 'test', role: 'USER' };

  beforeEach(async () => {
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
  });

  describe('POST /watchlist', () => {
    it('워치리스트에 추가해야 한다', async () => {
      const dto = { tmdbId: 550, contentType: 'movie' as const, status: 'want_to_watch' as const };
      const created = { id: 1, userId: 1, contentId: 1, status: 'want_to_watch' };
      mockWatchlistService.addToWatchlist.mockResolvedValue(created);

      const result = await controller.addToWatchlist(user, dto);

      expect(result).toEqual(created);
      expect(mockWatchlistService.addToWatchlist).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('PATCH /watchlist/:id', () => {
    it('워치리스트 상태를 업데이트해야 한다', async () => {
      const dto = { status: 'watched' as const };
      const updated = { id: 1, userId: 1, status: 'watched' };
      mockWatchlistService.updateStatus.mockResolvedValue(updated);

      const result = await controller.updateStatus(user, 1, dto);

      expect(result).toEqual(updated);
      expect(mockWatchlistService.updateStatus).toHaveBeenCalledWith(1, 1, dto);
    });
  });

  describe('DELETE /watchlist/:id', () => {
    it('워치리스트에서 제거해야 한다', async () => {
      mockWatchlistService.removeFromWatchlist.mockResolvedValue(undefined);

      const result = await controller.remove(user, 1);

      expect(result).toEqual({ message: 'Removed from watchlist' });
      expect(mockWatchlistService.removeFromWatchlist).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('GET /watchlist/me', () => {
    it('기본 파라미터로 워치리스트를 반환해야 한다', async () => {
      const paginated = { items: [], total: 0, page: 1, totalPages: 0 };
      mockWatchlistService.getMyWatchlist.mockResolvedValue(paginated);

      const result = await controller.getMyWatchlist(user);

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(1, 'want_to_watch', 1);
      expect(result).toEqual(paginated);
    });

    it('status와 page 파라미터를 전달해야 한다', async () => {
      const paginated = { items: [], total: 0, page: 2, totalPages: 1 };
      mockWatchlistService.getMyWatchlist.mockResolvedValue(paginated);

      const result = await controller.getMyWatchlist(user, 'watched', '2');

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(1, 'watched', 2);
      expect(result).toEqual(paginated);
    });

    it('유효하지 않은 status에 대해 want_to_watch를 기본값으로 사용해야 한다', async () => {
      mockWatchlistService.getMyWatchlist.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 });

      await controller.getMyWatchlist(user, 'invalid');

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(1, 'want_to_watch', 1);
    });
  });

  describe('GET /watchlist/me/counts', () => {
    it('워치리스트 카운트를 반환해야 한다', async () => {
      const counts = { watchedCount: 5, wantToWatchCount: 3 };
      mockWatchlistService.getMyWatchlistCounts.mockResolvedValue(counts);

      const result = await controller.getMyWatchlistCounts(user);

      expect(result).toEqual(counts);
      expect(mockWatchlistService.getMyWatchlistCounts).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /watchlist/me/want-to-watch', () => {
    it('모든 want_to_watch 항목을 반환해야 한다', async () => {
      const items = { items: [{ id: 1 }, { id: 2 }], total: 2 };
      mockWatchlistService.getWantToWatchAll.mockResolvedValue(items);

      const result = await controller.getWantToWatchAll(user);

      expect(result).toEqual(items);
      expect(mockWatchlistService.getWantToWatchAll).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /watchlist/me/watched-years', () => {
    it('중복 없는 감상 연도를 반환해야 한다', async () => {
      const years = { years: [2026, 2025, 2024] };
      mockWatchlistService.getWatchedYears.mockResolvedValue(years);

      const result = await controller.getWatchedYears(user);

      expect(result).toEqual(years);
      expect(mockWatchlistService.getWatchedYears).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /watchlist/me/watched', () => {
    it('기본적으로 현재 연도의 감상 항목을 반환해야 한다', async () => {
      const currentYear = new Date().getFullYear();
      const response = { year: currentYear, totalCount: 3, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      const result = await controller.getWatchedByYear(user);

      expect(result).toEqual(response);
      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, currentYear);
    });

    it('쿼리 파라미터에서 파싱된 연도를 전달해야 한다', async () => {
      const response = { year: 2025, totalCount: 5, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      const result = await controller.getWatchedByYear(user, '2025');

      expect(result).toEqual(response);
      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, 2025);
    });

    it('유효하지 않은 연도 문자열에 대해 현재 연도로 폴백해야 한다', async () => {
      const currentYear = new Date().getFullYear();
      const response = { year: currentYear, totalCount: 0, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      await controller.getWatchedByYear(user, 'invalid');

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, currentYear);
    });

    it('범위를 벗어난 연도에 대해 현재 연도로 폴백해야 한다', async () => {
      const currentYear = new Date().getFullYear();
      mockWatchlistService.getWatchedByYear.mockResolvedValue({ year: currentYear, totalCount: 0, months: [] });

      await controller.getWatchedByYear(user, '1800');

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, currentYear);
    });
  });

  describe('GET /watchlist/me/status', () => {
    it('tmdbId로 워치리스트 상태를 반환해야 한다', async () => {
      const status = { status: 'watched', watchlistId: 1 };
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue(status);

      const result = await controller.getWatchlistStatusByTmdbId(user, 550, 'movie');

      expect(result).toEqual(status);
      expect(mockWatchlistService.getWatchlistStatusByTmdbId).toHaveBeenCalledWith(1, 550, 'movie');
    });

    it('유효하지 않은 값에 대해 contentType 기본값을 movie로 사용해야 한다', async () => {
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue({ status: null, watchlistId: null });

      await controller.getWatchlistStatusByTmdbId(user, 550, 'invalid');

      expect(mockWatchlistService.getWatchlistStatusByTmdbId).toHaveBeenCalledWith(1, 550, 'movie');
    });

    it('contentType이 tv이면 tv를 사용해야 한다', async () => {
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue({ status: null, watchlistId: null });

      await controller.getWatchlistStatusByTmdbId(user, 100, 'tv');

      expect(mockWatchlistService.getWatchlistStatusByTmdbId).toHaveBeenCalledWith(1, 100, 'tv');
    });
  });
});
