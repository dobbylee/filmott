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
    it('should add to watchlist', async () => {
      const dto = { tmdbId: 550, contentType: 'movie' as const, status: 'want_to_watch' as const };
      const created = { id: 1, userId: 1, contentId: 1, status: 'want_to_watch' };
      mockWatchlistService.addToWatchlist.mockResolvedValue(created);

      const result = await controller.addToWatchlist(user, dto);

      expect(result).toEqual(created);
      expect(mockWatchlistService.addToWatchlist).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('PATCH /watchlist/:id', () => {
    it('should update watchlist status', async () => {
      const dto = { status: 'watched' as const };
      const updated = { id: 1, userId: 1, status: 'watched' };
      mockWatchlistService.updateStatus.mockResolvedValue(updated);

      const result = await controller.updateStatus(user, 1, dto);

      expect(result).toEqual(updated);
      expect(mockWatchlistService.updateStatus).toHaveBeenCalledWith(1, 1, dto);
    });
  });

  describe('DELETE /watchlist/:id', () => {
    it('should remove from watchlist', async () => {
      mockWatchlistService.removeFromWatchlist.mockResolvedValue(undefined);

      const result = await controller.remove(user, 1);

      expect(result).toEqual({ message: 'Removed from watchlist' });
      expect(mockWatchlistService.removeFromWatchlist).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('GET /watchlist/me', () => {
    it('should return watchlist with default params', async () => {
      const paginated = { items: [], total: 0, page: 1, totalPages: 0 };
      mockWatchlistService.getMyWatchlist.mockResolvedValue(paginated);

      const result = await controller.getMyWatchlist(user);

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(1, 'want_to_watch', 1);
      expect(result).toEqual(paginated);
    });

    it('should pass status and page params', async () => {
      const paginated = { items: [], total: 0, page: 2, totalPages: 1 };
      mockWatchlistService.getMyWatchlist.mockResolvedValue(paginated);

      const result = await controller.getMyWatchlist(user, 'watched', '2');

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(1, 'watched', 2);
      expect(result).toEqual(paginated);
    });

    it('should default to want_to_watch for invalid status', async () => {
      mockWatchlistService.getMyWatchlist.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 });

      await controller.getMyWatchlist(user, 'invalid');

      expect(mockWatchlistService.getMyWatchlist).toHaveBeenCalledWith(1, 'want_to_watch', 1);
    });
  });

  describe('GET /watchlist/me/counts', () => {
    it('should return watchlist counts', async () => {
      const counts = { watchedCount: 5, wantToWatchCount: 3 };
      mockWatchlistService.getMyWatchlistCounts.mockResolvedValue(counts);

      const result = await controller.getMyWatchlistCounts(user);

      expect(result).toEqual(counts);
      expect(mockWatchlistService.getMyWatchlistCounts).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /watchlist/me/want-to-watch', () => {
    it('should return all want_to_watch items', async () => {
      const items = { items: [{ id: 1 }, { id: 2 }], total: 2 };
      mockWatchlistService.getWantToWatchAll.mockResolvedValue(items);

      const result = await controller.getWantToWatchAll(user);

      expect(result).toEqual(items);
      expect(mockWatchlistService.getWantToWatchAll).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /watchlist/me/watched-years', () => {
    it('should return distinct watched years', async () => {
      const years = { years: [2026, 2025, 2024] };
      mockWatchlistService.getWatchedYears.mockResolvedValue(years);

      const result = await controller.getWatchedYears(user);

      expect(result).toEqual(years);
      expect(mockWatchlistService.getWatchedYears).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /watchlist/me/watched', () => {
    it('should return watched items for current year by default', async () => {
      const currentYear = new Date().getFullYear();
      const response = { year: currentYear, totalCount: 3, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      const result = await controller.getWatchedByYear(user);

      expect(result).toEqual(response);
      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, currentYear);
    });

    it('should pass parsed year from query param', async () => {
      const response = { year: 2025, totalCount: 5, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      const result = await controller.getWatchedByYear(user, '2025');

      expect(result).toEqual(response);
      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, 2025);
    });

    it('should fallback to current year for invalid year string', async () => {
      const currentYear = new Date().getFullYear();
      const response = { year: currentYear, totalCount: 0, months: [] };
      mockWatchlistService.getWatchedByYear.mockResolvedValue(response);

      await controller.getWatchedByYear(user, 'invalid');

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, currentYear);
    });

    it('should fallback to current year for out-of-range year', async () => {
      const currentYear = new Date().getFullYear();
      mockWatchlistService.getWatchedByYear.mockResolvedValue({ year: currentYear, totalCount: 0, months: [] });

      await controller.getWatchedByYear(user, '1800');

      expect(mockWatchlistService.getWatchedByYear).toHaveBeenCalledWith(1, currentYear);
    });
  });

  describe('GET /watchlist/me/status', () => {
    it('should return watchlist status by tmdbId', async () => {
      const status = { status: 'watched', watchlistId: 1 };
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue(status);

      const result = await controller.getWatchlistStatusByTmdbId(user, 550, 'movie');

      expect(result).toEqual(status);
      expect(mockWatchlistService.getWatchlistStatusByTmdbId).toHaveBeenCalledWith(1, 550, 'movie');
    });

    it('should default contentType to movie for invalid values', async () => {
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue({ status: null, watchlistId: null });

      await controller.getWatchlistStatusByTmdbId(user, 550, 'invalid');

      expect(mockWatchlistService.getWatchlistStatusByTmdbId).toHaveBeenCalledWith(1, 550, 'movie');
    });

    it('should use tv when contentType is tv', async () => {
      mockWatchlistService.getWatchlistStatusByTmdbId.mockResolvedValue({ status: null, watchlistId: null });

      await controller.getWatchlistStatusByTmdbId(user, 100, 'tv');

      expect(mockWatchlistService.getWatchlistStatusByTmdbId).toHaveBeenCalledWith(1, 100, 'tv');
    });
  });
});
