import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { Content } from './content.entity';
import { TmdbService } from '../tmdb/tmdb.service';

describe('ContentsService', () => {
  let service: ContentsService;
  let tmdbService: TmdbService;

  const mockContentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTmdbService = {
    getDetails: jest.fn(),
    searchMulti: jest.fn(),
    searchByType: jest.fn(),
    discoverByFilters: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentsService,
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
        { provide: TmdbService, useValue: mockTmdbService },
      ],
    }).compile();

    service = module.get<ContentsService>(ContentsService);
    tmdbService = module.get<TmdbService>(TmdbService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrFetchByTmdbId', () => {
    it('should return cached content if exists in DB', async () => {
      const cachedContent = {
        id: 1,
        tmdbId: 123,
        contentType: 'movie',
        title: 'Cached Movie',
      };
      mockContentRepo.findOne.mockResolvedValue(cachedContent);

      const result = await service.findOrFetchByTmdbId(123, 'movie');

      expect(result).toEqual(cachedContent);
      expect(mockTmdbService.getDetails).not.toHaveBeenCalled();
    });

    it('should fetch from TMDB and save when not in DB', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 123,
        title: 'New Movie',
        original_title: 'New Movie Original',
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        overview: 'A great movie',
        release_date: '2024-01-15',
        vote_average: 8.5,
        genres: [{ id: 28, name: 'Action' }],
        runtime: 120,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      const savedContent = { id: 1, tmdbId: 123, title: 'New Movie' };
      mockContentRepo.create.mockReturnValue(savedContent);
      mockContentRepo.save.mockResolvedValue(savedContent);

      const result = await service.findOrFetchByTmdbId(123, 'movie');

      expect(mockTmdbService.getDetails).toHaveBeenCalledWith(123, 'movie');
      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdbId: 123,
          contentType: 'movie',
          title: 'New Movie',
        }),
      );
      expect(result).toEqual(savedContent);
    });
  });

  describe('searchContents', () => {
    it('should call searchMulti when no type specified', async () => {
      const searchResult = { page: 1, total_pages: 1, total_results: 1, results: [] };
      mockTmdbService.searchMulti.mockResolvedValue(searchResult);

      const result = await service.searchContents('test');

      expect(mockTmdbService.searchMulti).toHaveBeenCalledWith('test', 1);
      expect(result).toEqual(searchResult);
    });

    it('should call searchByType when type is specified', async () => {
      const searchResult = { page: 1, total_pages: 1, total_results: 1, results: [] };
      mockTmdbService.searchByType.mockResolvedValue(searchResult);

      const result = await service.searchContents('test', 'movie', 2);

      expect(mockTmdbService.searchByType).toHaveBeenCalledWith('test', 'movie', 2);
      expect(result).toEqual(searchResult);
    });
  });

  describe('getContentDetail', () => {
    it('should fetch from TMDB, upsert to DB, and include extra info', async () => {
      const tmdbData = {
        id: 456,
        title: 'Detail Movie',
        original_title: 'Detail Movie',
        poster_path: '/poster.jpg',
        backdrop_path: null,
        overview: 'Description',
        release_date: '2024-06-01',
        vote_average: 7.2,
        genres: [{ id: 18, name: 'Drama' }],
        runtime: 95,
        credits: {
          cast: [
            { id: 1, name: 'Actor 1', character: 'Role 1', profile_path: '/a1.jpg', order: 0 },
          ],
        },
        'watch/providers': {
          results: {
            KR: {
              flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/nf.jpg' }],
            },
          },
        },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      // upsert: no existing record
      mockContentRepo.findOne.mockResolvedValue(null);
      const savedContent = {
        id: 2,
        tmdbId: 456,
        contentType: 'movie',
        title: 'Detail Movie',
      };
      mockContentRepo.create.mockReturnValue(savedContent);
      mockContentRepo.save.mockResolvedValue(savedContent);

      const result = await service.getContentDetail(456, 'movie');

      expect(result.watchProviders).toEqual(
        tmdbData['watch/providers'].results.KR,
      );
      expect(result.credits).toHaveLength(1);
      expect(result.tmdbId).toBe(456);
    });

    it('should throw NotFoundException when TMDB returns no data', async () => {
      mockTmdbService.getDetails.mockResolvedValue({});

      await expect(
        service.getContentDetail(999, 'movie'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update existing content in DB on detail fetch', async () => {
      const tmdbData = {
        id: 789,
        title: 'Updated Movie',
        original_title: 'Updated Movie',
        poster_path: '/new-poster.jpg',
        backdrop_path: null,
        overview: 'Updated desc',
        release_date: '2024-03-01',
        vote_average: 8.0,
        genres: [],
        runtime: 100,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      const existingContent = {
        id: 3,
        tmdbId: 789,
        contentType: 'movie',
        title: 'Old Title',
      };
      mockContentRepo.findOne.mockResolvedValue(existingContent);
      mockContentRepo.save.mockResolvedValue({
        ...existingContent,
        title: 'Updated Movie',
      });

      const result = await service.getContentDetail(789, 'movie');

      expect(mockContentRepo.save).toHaveBeenCalled();
      expect(result.title).toBe('Updated Movie');
    });
  });

  describe('discoverContents', () => {
    it('should call discoverByFilters with correct parameters', async () => {
      const discoverResult = { page: 1, total_pages: 5, total_results: 100, results: [] };
      mockTmdbService.discoverByFilters.mockResolvedValue(discoverResult);

      const result = await service.discoverContents('tv', {
        genres: '18',
        providers: '8',
        year: 2024,
        page: 3,
      });

      expect(mockTmdbService.discoverByFilters).toHaveBeenCalledWith('tv', {
        genres: '18',
        watchProviders: '8',
        year: 2024,
        page: 3,
      });
      expect(result).toEqual(discoverResult);
    });
  });
});
