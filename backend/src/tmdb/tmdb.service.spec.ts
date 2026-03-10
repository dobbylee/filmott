import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { TmdbService } from './tmdb.service';
import { AxiosResponse, AxiosHeaders } from 'axios';

describe('TmdbService', () => {
  let service: TmdbService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  const makeAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TmdbService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<TmdbService>(TmdbService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchMulti', () => {
    it('should filter results to only movie and tv', async () => {
      const mockData = {
        page: 1,
        total_pages: 1,
        total_results: 3,
        results: [
          { id: 1, media_type: 'movie', title: 'Movie 1' },
          { id: 2, media_type: 'tv', name: 'TV Show 1' },
          { id: 3, media_type: 'person', name: 'Person 1' },
        ],
      };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.searchMulti('test');

      expect(result.results).toHaveLength(2);
      expect(result.results.every(
        (r) => r.media_type === 'movie' || r.media_type === 'tv',
      )).toBe(true);
      expect(mockHttpService.get).toHaveBeenCalledWith('/search/multi', {
        params: { query: 'test', page: 1, language: 'ko-KR', region: 'KR' },
      });
    });
  });

  describe('searchByType', () => {
    it('should inject media_type into results', async () => {
      const mockData = {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 1, title: 'Movie 1' }],
      };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.searchByType('test', 'movie');

      expect(result.results[0].media_type).toBe('movie');
      expect(mockHttpService.get).toHaveBeenCalledWith('/search/movie', {
        params: { query: 'test', page: 1, language: 'ko-KR', region: 'KR' },
      });
    });
  });

  describe('getDetails', () => {
    it('should fetch movie details with credits and watch providers', async () => {
      const mockData = {
        id: 123,
        title: 'Test Movie',
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.getDetails(123, 'movie');

      expect(result.id).toBe(123);
      expect(mockHttpService.get).toHaveBeenCalledWith('/movie/123', {
        params: {
          language: 'ko-KR',
          append_to_response: 'credits,watch/providers',
        },
      });
    });
  });

  describe('getPopular', () => {
    it('should fetch popular content', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.getPopular('tv', 2);

      expect(mockHttpService.get).toHaveBeenCalledWith('/tv/popular', {
        params: { page: 2, language: 'ko-KR', region: 'KR' },
      });
    });
  });

  describe('getNowPlaying', () => {
    it('should fetch now playing movies', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.getNowPlaying();

      expect(mockHttpService.get).toHaveBeenCalledWith('/movie/now_playing', {
        params: { page: 1, language: 'ko-KR', region: 'KR' },
      });
    });
  });

  describe('getTrending', () => {
    it('should fetch trending content with time window', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.getTrending('all', 'week');

      expect(mockHttpService.get).toHaveBeenCalledWith('/trending/all/week', {
        params: { language: 'ko-KR' },
      });
    });
  });

  describe('getWatchProviders', () => {
    it('should return KR providers when available', async () => {
      const krProviders = {
        flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/logo.jpg' }],
      };
      const mockData = { results: { KR: krProviders } };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.getWatchProviders(123, 'movie');

      expect(result).toEqual(krProviders);
    });

    it('should return null when KR providers not available', async () => {
      const mockData = { results: {} };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.getWatchProviders(123, 'movie');

      expect(result).toBeNull();
    });
  });

  describe('discoverByFilters', () => {
    it('should pass filter parameters correctly for movies', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.discoverByFilters('movie', {
        genres: '28,12',
        watchProviders: '8',
        year: 2024,
        page: 2,
      });

      expect(mockHttpService.get).toHaveBeenCalledWith('/discover/movie', {
        params: {
          language: 'ko-KR',
          watch_region: 'KR',
          page: 2,
          sort_by: 'popularity.desc',
          with_genres: '28,12',
          with_watch_providers: '8',
          primary_release_year: 2024,
        },
      });
    });

    it('should use first_air_date_year for TV type', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.discoverByFilters('tv', { year: 2024 });

      expect(mockHttpService.get).toHaveBeenCalledWith('/discover/tv', {
        params: expect.objectContaining({
          first_air_date_year: 2024,
        }),
      });
    });
  });
});
