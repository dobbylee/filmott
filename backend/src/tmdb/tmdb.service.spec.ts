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
    it('결과를 movie, tv, person으로 필터링해야 한다', async () => {
      const mockData = {
        page: 1,
        total_pages: 1,
        total_results: 4,
        results: [
          { id: 1, media_type: 'movie', title: 'Movie 1' },
          { id: 2, media_type: 'tv', name: 'TV Show 1' },
          { id: 3, media_type: 'person', name: 'Person 1' },
          { id: 4, media_type: 'collection', name: 'Collection 1' },
        ],
      };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.searchMulti('test');

      expect(result.results).toHaveLength(3);
      expect(result.results.every(
        (r) =>
          r.media_type === 'movie' ||
          r.media_type === 'tv' ||
          r.media_type === 'person',
      )).toBe(true);
      expect(mockHttpService.get).toHaveBeenCalledWith('/search/multi', {
        params: { query: 'test', page: 1, language: 'ko-KR', region: 'KR' },
      });
    });
  });

  describe('searchByType', () => {
    it('결과에 media_type을 주입해야 한다', async () => {
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
    it('크레딧과 시청 제공자를 포함한 영화 상세 정보를 가져와야 한다', async () => {
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
    it('인기 콘텐츠를 가져와야 한다', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.getPopular('tv', 2);

      expect(mockHttpService.get).toHaveBeenCalledWith('/tv/popular', {
        params: { page: 2, language: 'ko-KR', region: 'KR' },
      });
    });
  });

  describe('getNowPlaying', () => {
    it('현재 상영 중인 영화를 가져와야 한다', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.getNowPlaying();

      expect(mockHttpService.get).toHaveBeenCalledWith('/movie/now_playing', {
        params: { page: 1, language: 'ko-KR', region: 'KR' },
      });
    });
  });

  describe('getTrending', () => {
    it('시간 범위와 함께 트렌딩 콘텐츠를 가져와야 한다', async () => {
      const mockData = { page: 1, total_pages: 1, total_results: 0, results: [] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      await service.getTrending('all', 'week');

      expect(mockHttpService.get).toHaveBeenCalledWith('/trending/all/week', {
        params: { language: 'ko-KR' },
      });
    });
  });

  describe('getWatchProviders', () => {
    it('KR 제공자가 있을 때 반환해야 한다', async () => {
      const krProviders = {
        flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/logo.jpg' }],
      };
      const mockData = { results: { KR: krProviders } };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.getWatchProviders(123, 'movie');

      expect(result).toEqual(krProviders);
    });

    it('KR 제공자가 없을 때 null을 반환해야 한다', async () => {
      const mockData = { results: {} };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.getWatchProviders(123, 'movie');

      expect(result).toBeNull();
    });
  });

  describe('getPersonDetail', () => {
    it('ko-KR 언어로 인물 상세 정보를 가져와야 한다', async () => {
      const mockData = {
        id: 17419,
        name: 'Bryan Cranston',
        profile_path: '/profile.jpg',
        biography: 'An actor.',
        birthday: '1956-03-07',
        place_of_birth: 'Hollywood, California, USA',
        known_for_department: 'Acting',
      };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.getPersonDetail(17419);

      expect(result).toEqual(mockData);
      expect(mockHttpService.get).toHaveBeenCalledWith('/person/17419', {
        params: { language: 'ko-KR' },
      });
    });
  });

  describe('getPersonCredits', () => {
    it('ko-KR 언어로 인물 통합 출연작을 가져와야 한다', async () => {
      const mockData = {
        cast: [
          { id: 1396, media_type: 'tv', name: 'Breaking Bad', character: 'Walter White' },
        ],
        crew: [
          { id: 100, media_type: 'movie', title: 'Some Movie', job: 'Director' },
        ],
      };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(mockData)));

      const result = await service.getPersonCredits(17419);

      expect(result).toEqual(mockData);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        '/person/17419/combined_credits',
        { params: { language: 'ko-KR' } },
      );
    });
  });

  describe('discoverByFilters', () => {
    it('영화에 대해 필터 파라미터를 올바르게 전달해야 한다', async () => {
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
          with_watch_monetization_types: 'flatrate|rent|buy|free|ads',
          primary_release_year: 2024,
        },
      });
    });

    it('TV 타입에 대해 first_air_date_year를 사용해야 한다', async () => {
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
