import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GatewayTimeoutException, NotFoundException } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { Content } from './content.entity';
import { TmdbService } from '../tmdb/tmdb.service';
import { RevalidateService } from '../common/revalidate.service';
describe('ContentsService', () => {
  let service: ContentsService;
  let tmdbService: TmdbService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockContentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockTmdbService = {
    getDetails: jest.fn(),
    searchMulti: jest.fn(),
    searchByType: jest.fn(),
    discoverByFilters: jest.fn(),
    getPersonDetail: jest.fn(),
    getPersonCredits: jest.fn(),
  };

  const mockRevalidateService = {
    revalidatePath: jest.fn().mockResolvedValue(undefined),
    revalidatePaths: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentsService,
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
        { provide: TmdbService, useValue: mockTmdbService },
        { provide: RevalidateService, useValue: mockRevalidateService },
      ],
    }).compile();

    service = module.get<ContentsService>(ContentsService);
    tmdbService = module.get<TmdbService>(TmdbService);

    mockContentRepo.find.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrFetchByTmdbId', () => {
    it('DB에 캐시된 콘텐츠가 있으면 반환해야 한다', async () => {
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

    it('DB에 없으면 TMDB에서 가져와 저장해야 한다', async () => {
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
        vote_count: 5000,
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
          voteCount: 5000,
        }),
      );
      expect(result).toEqual(savedContent);
    });
  });

  describe('searchContents', () => {
    it('type이 지정되지 않으면 person, movie, tv에 대해 searchByType을 호출해야 한다', async () => {
      const personResult = {
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [{ id: 1, media_type: 'person' }],
      };
      const movieResult = {
        page: 1,
        total_pages: 2,
        total_results: 5,
        results: [{ id: 2, media_type: 'movie' }],
      };
      const tvResult = {
        page: 1,
        total_pages: 1,
        total_results: 3,
        results: [{ id: 3, media_type: 'tv' }],
      };

      mockTmdbService.searchByType
        .mockResolvedValueOnce(personResult)
        .mockResolvedValueOnce(movieResult)
        .mockResolvedValueOnce(tvResult);

      const result = await service.searchContents('test');

      expect(mockTmdbService.searchByType).toHaveBeenCalledTimes(3);
      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'test',
        'person',
        1,
      );
      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'test',
        'movie',
        1,
      );
      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'test',
        'tv',
        1,
      );
      expect(result.page).toBe(1);
      expect(result.total_pages).toBe(2); // max(2, 1)
      expect((result as { personTotal: number }).personTotal).toBe(2);
      expect((result as { contentTotal: number }).contentTotal).toBe(8); // 5 + 3
      expect(result.total_results).toBe(10); // 2 + 5 + 3
      expect(result.results).toHaveLength(3);
    });

    it('type이 지정되면 searchByType을 호출해야 한다', async () => {
      const searchResult = {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [],
      };
      mockTmdbService.searchByType.mockResolvedValue(searchResult);

      const result = await service.searchContents('test', 'movie', 2);

      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'test',
        'movie',
        2,
      );
      expect(result).toEqual(searchResult);
    });
  });

  describe('getContentDetail', () => {
    it('캐시 미스 시 TMDB에서 가져와 DB에 저장하고 추가 정보를 포함해야 한다', async () => {
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
            {
              id: 1,
              name: 'Actor 1',
              character: 'Role 1',
              profile_path: '/a1.jpg',
              order: 0,
            },
          ],
        },
        'watch/providers': {
          results: {
            KR: {
              flatrate: [
                {
                  provider_id: 8,
                  provider_name: 'Netflix',
                  logo_path: '/nf.jpg',
                },
              ],
            },
          },
        },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      // 첫번째 findOne: TTL 캐시 확인 (미스)
      // 두번째 findOne: upsertFromTmdb 내부
      mockContentRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const savedContent = {
        id: 2,
        tmdbId: 456,
        contentType: 'movie',
        title: 'Detail Movie',
      };
      mockContentRepo.create.mockReturnValue(savedContent);
      mockContentRepo.save.mockResolvedValue(savedContent);

      const result = await service.getContentDetail(456, 'movie');

      expect(mockTmdbService.getDetails).toHaveBeenCalledWith(456, 'movie');
      expect(result.watchProviders).toEqual(
        tmdbData['watch/providers'].results.KR,
      );
      expect(result.credits).toHaveLength(1);
      expect(result.tmdbId).toBe(456);
    });

    it('TTL 이내 캐시가 있으면 TMDB 호출 없이 DB 캐시를 반환해야 한다', async () => {
      const cachedContent = {
        id: 2,
        tmdbId: 456,
        contentType: 'movie',
        title: 'Cached Movie',
        updatedAt: new Date(), // 방금 업데이트됨 (TTL 이내)
        watchProviders: { flatrate: [{ provider_id: 8 }] },
        credits: [{ id: 1, name: 'Actor 1' }],
      };
      mockContentRepo.findOne.mockResolvedValue(cachedContent);

      const result = await service.getContentDetail(456, 'movie');

      expect(mockTmdbService.getDetails).not.toHaveBeenCalled();
      expect(result.tmdbId).toBe(456);
      expect(result.watchProviders).toEqual(cachedContent.watchProviders);
      expect(result.credits).toEqual(cachedContent.credits);
    });

    it('TTL 초과 시 캐시를 즉시 반환하고 백그라운드에서 갱신해야 한다', async () => {
      const expiredContent = {
        id: 3,
        tmdbId: 789,
        contentType: 'movie',
        title: 'Old Title',
        updatedAt: new Date(Date.now() - 73 * 60 * 60 * 1000), // 73시간 전 (TTL 72시간 초과)
        watchProviders: { flatrate: [] },
        credits: [],
      };
      mockContentRepo.findOne
        .mockResolvedValueOnce(expiredContent)
        .mockResolvedValueOnce(expiredContent);

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
        credits: { cast: [{ id: 10, name: 'New Actor' }] },
        'watch/providers': {
          results: {
            KR: { flatrate: [{ provider_id: 337, provider_name: 'Disney+' }] },
          },
        },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);
      mockContentRepo.save.mockImplementation((c: any) => Promise.resolve(c));

      // TTL 초과 시 캐시된 데이터를 즉시 반환
      const result = await service.getContentDetail(789, 'movie');

      expect(result.title).toBe('Old Title');
      expect(result.watchProviders).toEqual(expiredContent.watchProviders);
      expect(result.credits).toEqual(expiredContent.credits);

      // 백그라운드 갱신이 비동기로 실행됨 (await 없이)
      await new Promise((r) => setTimeout(r, 10));
      expect(mockTmdbService.getDetails).toHaveBeenCalledWith(789, 'movie');
    });

    it('캐시에 watchProviders가 null이면 TMDB를 재호출해야 한다', async () => {
      const partialCache = {
        id: 4,
        tmdbId: 100,
        contentType: 'movie',
        title: 'Partial Cache',
        updatedAt: new Date(),
        watchProviders: null,
        credits: null,
      };
      mockContentRepo.findOne
        .mockResolvedValueOnce(partialCache)
        .mockResolvedValueOnce(partialCache);

      const tmdbData = {
        id: 100,
        title: 'Partial Cache',
        original_title: 'Partial Cache',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);
      mockContentRepo.save.mockImplementation((c: any) => Promise.resolve(c));

      await service.getContentDetail(100, 'movie');

      expect(mockTmdbService.getDetails).toHaveBeenCalledWith(100, 'movie');
    });

    it('TMDB가 데이터를 반환하지 않으면 NotFoundException을 던져야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);
      mockTmdbService.getDetails.mockResolvedValue({});

      await expect(service.getContentDetail(999, 'movie')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOrFetchByTmdbId - TV 콘텐츠', () => {
    it('name과 first_air_date를 사용하여 TV 콘텐츠를 매핑해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tvData = {
        id: 456,
        name: 'TV Show',
        original_name: 'TV Show Original',
        poster_path: '/show.jpg',
        backdrop_path: null,
        overview: 'A TV show',
        first_air_date: '2023-09-01',
        vote_average: 7.0,
        genres: [{ id: 18, name: 'Drama' }],
        episode_run_time: [45],
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tvData);

      const savedContent = {
        id: 5,
        tmdbId: 456,
        title: 'TV Show',
        contentType: 'tv',
      };
      mockContentRepo.create.mockReturnValue(savedContent);
      mockContentRepo.save.mockResolvedValue(savedContent);

      const result = await service.findOrFetchByTmdbId(456, 'tv');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdbId: 456,
          contentType: 'tv',
          title: 'TV Show',
        }),
      );
      expect(result).toEqual(savedContent);
    });

    it('TV에 직접 runtime이 없으면 episode_run_time을 사용해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tvData = {
        id: 789,
        name: 'Another Show',
        original_name: 'Another Show',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        first_air_date: '2022-01-01',
        vote_average: 6.5,
        genres: [],
        runtime: null,
        episode_run_time: [30, 35],
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tvData);

      const savedContent = { id: 6, tmdbId: 789 };
      mockContentRepo.create.mockImplementation((data: any) => data);
      mockContentRepo.save.mockResolvedValue(savedContent);

      await service.findOrFetchByTmdbId(789, 'tv');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: 30 }),
      );
    });
  });

  describe('getPersonDetail', () => {
    it('tmdbService.getPersonDetail에 위임해야 한다', async () => {
      const personData = {
        id: 17419,
        name: 'Bryan Cranston',
        profile_path: '/profile.jpg',
        biography: 'An actor.',
        birthday: '1956-03-07',
        place_of_birth: 'Hollywood, California, USA',
        known_for_department: 'Acting',
      };
      mockTmdbService.getPersonDetail.mockResolvedValue(personData);

      const result = await service.getPersonDetail(17419);

      expect(mockTmdbService.getPersonDetail).toHaveBeenCalledWith(17419);
      expect(result).toEqual(personData);
    });

    it('타임아웃이면 만료된 stale cache를 반환해야 한다', async () => {
      const personData = {
        id: 17419,
        name: 'Bryan Cranston',
        profile_path: '/profile.jpg',
        biography: 'An actor.',
        birthday: '1956-03-07',
        place_of_birth: 'Hollywood, California, USA',
        known_for_department: 'Acting',
      };
      mockTmdbService.getPersonDetail.mockResolvedValueOnce(personData);
      await service.getPersonDetail(17419);

      const detailCache = (
        service as unknown as {
          personDetailCache: Map<
            number,
            { data: typeof personData; expiresAt: number }
          >;
        }
      ).personDetailCache;
      const cached = detailCache.get(17419);
      if (cached) cached.expiresAt = Date.now() - 1000;

      mockTmdbService.getPersonDetail.mockRejectedValueOnce(
        new GatewayTimeoutException('TMDB person 응답 시간이 초과되었습니다.'),
      );

      const result = await service.getPersonDetail(17419);

      expect(result).toEqual(personData);
      expect(mockTmdbService.getPersonDetail).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPersonCredits', () => {
    it('movie/tv로 필터링하고 날짜 내림차순으로 정렬해야 한다', async () => {
      const creditsData = {
        cast: [
          {
            id: 1,
            media_type: 'movie',
            title: 'Old Movie',
            release_date: '2010-05-01',
            vote_average: 7.0,
          },
          {
            id: 2,
            media_type: 'tv',
            name: 'New Show',
            first_air_date: '2024-01-15',
            vote_average: 8.5,
          },
          {
            id: 3,
            media_type: 'movie',
            title: 'No Date Movie',
            vote_average: 6.0,
          },
        ],
        crew: [
          {
            id: 4,
            media_type: 'movie',
            title: 'Directed Movie',
            release_date: '2020-06-01',
            job: 'Director',
            vote_average: 7.5,
          },
        ],
      };
      mockTmdbService.getPersonCredits.mockResolvedValue(creditsData);

      const result = await service.getPersonCredits(17419);

      expect(mockTmdbService.getPersonCredits).toHaveBeenCalledWith(17419);
      // cast should be sorted: 2024 > 2010 > no date
      expect(result.cast).toHaveLength(3);
      expect(result.cast[0].id).toBe(2); // 2024
      expect(result.cast[1].id).toBe(1); // 2010
      expect(result.cast[2].id).toBe(3); // no date (last)
      // crew
      expect(result.crew).toHaveLength(1);
      expect(result.crew[0].id).toBe(4);
    });

    it('크레딧에서 movie/tv가 아닌 미디어 타입을 제외해야 한다', async () => {
      const creditsData = {
        cast: [
          {
            id: 1,
            media_type: 'movie',
            title: 'A Movie',
            release_date: '2020-01-01',
            vote_average: 7.0,
          },
          { id: 2, media_type: 'person', name: 'Someone', vote_average: 0 },
        ],
        crew: [],
      };
      mockTmdbService.getPersonCredits.mockResolvedValue(creditsData);

      const result = await service.getPersonCredits(100);

      expect(result.cast).toHaveLength(1);
      expect(result.cast[0].media_type).toBe('movie');
    });

    it('크레딧 타임아웃이면 만료된 stale cache를 사용해야 한다', async () => {
      const creditsData = {
        cast: [
          {
            id: 1,
            media_type: 'movie',
            title: 'A Movie',
            release_date: '2020-01-01',
            vote_average: 7.0,
          },
        ],
        crew: [],
      };

      mockContentRepo.find.mockResolvedValue([]);
      mockTmdbService.getPersonCredits.mockResolvedValueOnce(creditsData);
      await service.getPersonCredits(100);

      const creditsCache = (
        service as unknown as {
          personCreditsCache: Map<
            number,
            { data: typeof creditsData; expiresAt: number }
          >;
        }
      ).personCreditsCache;
      const cached = creditsCache.get(100);
      if (cached) cached.expiresAt = Date.now() - 1000;

      mockTmdbService.getPersonCredits.mockRejectedValueOnce(
        new GatewayTimeoutException(
          'TMDB person/combined_credits 응답 시간이 초과되었습니다.',
        ),
      );

      const result = await service.getPersonCredits(100);

      expect(result.cast).toHaveLength(1);
      expect(result.cast[0].id).toBe(1);
      expect(mockTmdbService.getPersonCredits).toHaveBeenCalledTimes(2);
    });
  });

  describe('discoverContents', () => {
    it('올바른 파라미터로 discoverByFilters를 호출해야 한다', async () => {
      const discoverResult = {
        page: 1,
        total_pages: 5,
        total_results: 100,
        results: [],
      };
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

    it('기본 파라미터 없이 호출해도 정상 동작해야 한다', async () => {
      const discoverResult = {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      };
      mockTmdbService.discoverByFilters.mockResolvedValue(discoverResult);

      const result = await service.discoverContents('movie', {});

      expect(mockTmdbService.discoverByFilters).toHaveBeenCalledWith('movie', {
        genres: undefined,
        watchProviders: undefined,
        year: undefined,
        sort: undefined,
        page: undefined,
      });
      expect(result).toEqual(discoverResult);
    });
  });

  describe('findOrFetchByTmdbId - GENRE_NAME_MAP 적용', () => {
    it('TMDB 장르 id에 대해 한글명으로 매핑해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 999,
        title: 'Genre Test Movie',
        original_title: 'Genre Test Movie',
        poster_path: null,
        backdrop_path: null,
        overview: 'Test',
        release_date: '2024-01-01',
        vote_average: 7.0,
        genres: [
          { id: 28, name: 'Action' },
          { id: 18, name: 'Drama' },
          { id: 9999, name: 'Unknown Genre' },
        ],
        runtime: 120,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      const savedContent = { id: 10, tmdbId: 999, title: 'Genre Test Movie' };
      mockContentRepo.create.mockReturnValue(savedContent);
      mockContentRepo.save.mockResolvedValue(savedContent);

      await service.findOrFetchByTmdbId(999, 'movie');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          genres: [
            { id: 28, name: '액션' },
            { id: 18, name: '드라마' },
            { id: 9999, name: 'Unknown Genre' },
          ],
        }),
      );
    });

    it('GENRE_NAME_MAP에 없는 장르는 TMDB 원본 이름을 사용해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 888,
        title: 'Unknown Genre Movie',
        original_title: 'Unknown Genre Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [{ id: 99999, name: 'Exotic Genre' }],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      mockContentRepo.create.mockImplementation((data: any) => data);
      mockContentRepo.save.mockImplementation((data: any) =>
        Promise.resolve(data),
      );

      await service.findOrFetchByTmdbId(888, 'movie');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          genres: [{ id: 99999, name: 'Exotic Genre' }],
        }),
      );
    });
  });

  describe('mapTmdbToContent - voteCount 매핑', () => {
    it('TMDB vote_count가 있으면 voteCount로 매핑해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 777,
        title: 'Vote Count Movie',
        original_title: 'Vote Count Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: 7.5,
        vote_count: 12000,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      mockContentRepo.create.mockImplementation(
        (data: Partial<Content>) => data,
      );
      mockContentRepo.save.mockImplementation((data: Partial<Content>) =>
        Promise.resolve(data),
      );

      await service.findOrFetchByTmdbId(777, 'movie');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          voteCount: 12000,
        }),
      );
    });

    it('TMDB vote_count가 없으면 기본값 0으로 매핑해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 778,
        title: 'No Vote Count Movie',
        original_title: 'No Vote Count Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      mockContentRepo.create.mockImplementation(
        (data: Partial<Content>) => data,
      );
      mockContentRepo.save.mockImplementation((data: Partial<Content>) =>
        Promise.resolve(data),
      );

      await service.findOrFetchByTmdbId(778, 'movie');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          voteCount: 0,
        }),
      );
    });
  });

  describe('searchContents - 추가 케이스', () => {
    it('person 타입으로 검색하면 searchByType에 person을 전달해야 한다', async () => {
      const searchResult = {
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [{ id: 1 }],
      };
      mockTmdbService.searchByType.mockResolvedValue(searchResult);

      const result = await service.searchContents('배우', 'person', 1);

      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        '배우',
        'person',
        1,
      );
      expect(result).toEqual(searchResult);
    });

    it('tv 타입으로 검색하면 searchByType에 tv를 전달해야 한다', async () => {
      const searchResult = {
        page: 2,
        total_pages: 5,
        total_results: 50,
        results: [],
      };
      mockTmdbService.searchByType.mockResolvedValue(searchResult);

      const result = await service.searchContents('드라마', 'tv', 2);

      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        '드라마',
        'tv',
        2,
      );
      expect(result.page).toBe(2);
    });

    it('전체 검색 시 person은 항상 page 1로 호출해야 한다', async () => {
      const personResult = {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      };
      const movieResult = {
        page: 3,
        total_pages: 3,
        total_results: 10,
        results: [],
      };
      const tvResult = {
        page: 3,
        total_pages: 2,
        total_results: 5,
        results: [],
      };

      mockTmdbService.searchByType
        .mockResolvedValueOnce(personResult)
        .mockResolvedValueOnce(movieResult)
        .mockResolvedValueOnce(tvResult);

      await service.searchContents('test', undefined, 3);

      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'test',
        'person',
        1,
      );
      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'test',
        'movie',
        3,
      );
      expect(mockTmdbService.searchByType).toHaveBeenCalledWith(
        'test',
        'tv',
        3,
      );
    });
  });

  describe('getContentDetail - 추가 케이스', () => {
    it('TMDB에서 KR 이외의 지역 결과만 있으면 watchProviders가 null이어야 한다', async () => {
      mockContentRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const tmdbData = {
        id: 700,
        title: 'Non-KR Movie',
        original_title: 'Non-KR Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': {
          results: {
            US: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] },
          },
        },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      const savedContent = {
        id: 20,
        tmdbId: 700,
        contentType: 'movie',
        title: 'Non-KR Movie',
      };
      mockContentRepo.create.mockReturnValue(savedContent);
      mockContentRepo.save.mockImplementation((c: any) => Promise.resolve(c));

      const result = await service.getContentDetail(700, 'movie');

      expect(result.watchProviders).toBeNull();
    });

    it('credits.cast가 20개 초과이면 20개로 잘라야 한다', async () => {
      mockContentRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const cast = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        name: `Actor ${i + 1}`,
        character: `Role ${i + 1}`,
        profile_path: null,
        order: i,
      }));

      const tmdbData = {
        id: 800,
        title: 'Big Cast Movie',
        original_title: 'Big Cast Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      const savedContent = {
        id: 21,
        tmdbId: 800,
        contentType: 'movie',
        title: 'Big Cast Movie',
      };
      mockContentRepo.create.mockReturnValue(savedContent);
      mockContentRepo.save.mockImplementation((c: any) => Promise.resolve(c));

      const result = await service.getContentDetail(800, 'movie');

      expect(result.credits).toHaveLength(20);
    });
  });

  describe('mapTmdbToContent - adult 매핑', () => {
    it('TMDB adult가 true이면 adult: true로 매핑해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 900,
        title: 'Adult Movie',
        original_title: 'Adult Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        adult: true,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      mockContentRepo.create.mockImplementation(
        (data: Partial<Content>) => data,
      );
      mockContentRepo.save.mockImplementation((data: Partial<Content>) =>
        Promise.resolve(data),
      );

      await service.findOrFetchByTmdbId(900, 'movie');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adult: true,
        }),
      );
    });

    it('TMDB adult가 false이면 adult: false로 매핑해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 901,
        title: 'Normal Movie',
        original_title: 'Normal Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        adult: false,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      mockContentRepo.create.mockImplementation(
        (data: Partial<Content>) => data,
      );
      mockContentRepo.save.mockImplementation((data: Partial<Content>) =>
        Promise.resolve(data),
      );

      await service.findOrFetchByTmdbId(901, 'movie');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adult: false,
        }),
      );
    });

    it('TMDB adult가 없으면 기본값 false로 매핑해야 한다', async () => {
      mockContentRepo.findOne.mockResolvedValue(null);

      const tmdbData = {
        id: 902,
        title: 'No Adult Field Movie',
        original_title: 'No Adult Field Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      mockContentRepo.create.mockImplementation(
        (data: Partial<Content>) => data,
      );
      mockContentRepo.save.mockImplementation((data: Partial<Content>) =>
        Promise.resolve(data),
      );

      await service.findOrFetchByTmdbId(902, 'movie');

      expect(mockContentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adult: false,
        }),
      );
    });
  });

  describe('upsertFromTmdb - adult 보존', () => {
    it('기존 콘텐츠가 adult=true일 때 TMDB 갱신 후에도 adult=true가 유지되어야 한다', async () => {
      const existingContent = {
        id: 10,
        tmdbId: 999,
        contentType: 'movie',
        title: 'Blocked Movie',
        adult: true,
      };

      const tmdbData = {
        id: 999,
        title: 'Blocked Movie Updated',
        original_title: 'Blocked Movie Updated',
        poster_path: '/new.jpg',
        backdrop_path: null,
        overview: 'Updated',
        release_date: '2024-01-01',
        vote_average: 6.0,
        adult: false,
        genres: [],
        runtime: 90,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      // getContentDetail → 캐시 미스 → fetchAndSave → upsertFromTmdb
      mockContentRepo.findOne
        .mockResolvedValueOnce(null) // getContentDetail 캐시 미스
        .mockResolvedValueOnce(existingContent); // upsertFromTmdb 내부 findOne
      mockContentRepo.save.mockImplementation((c: Partial<Content>) =>
        Promise.resolve(c as Content),
      );

      const result = await service.getContentDetail(999, 'movie');

      // save 호출 시 adult가 true로 유지되어야 한다
      const savedContent = mockContentRepo.save.mock.calls[0][0];
      expect(savedContent.adult).toBe(true);
      expect(result.title).toBe('Blocked Movie Updated');
    });

    it('기존 콘텐츠가 adult=false일 때 TMDB adult=true이면 adult=true로 반영해야 한다', async () => {
      const existingContent = {
        id: 11,
        tmdbId: 998,
        contentType: 'movie',
        title: 'Normal Movie',
        adult: false,
      };

      const tmdbData = {
        id: 998,
        title: 'Normal Movie',
        original_title: 'Normal Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        adult: true,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      mockContentRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingContent);
      mockContentRepo.save.mockImplementation((c: Partial<Content>) =>
        Promise.resolve(c as Content),
      );

      await service.getContentDetail(998, 'movie');

      const savedContent = mockContentRepo.save.mock.calls[0][0];
      expect(savedContent.adult).toBe(true);
    });
  });

  describe('getAdultContents', () => {
    it('adult=true인 콘텐츠를 페이징하여 반환해야 한다', async () => {
      const adultList = [
        {
          id: 1,
          tmdbId: 123,
          contentType: 'movie',
          title: 'Adult Movie',
          posterUrl: '/poster.jpg',
        },
        {
          id: 2,
          tmdbId: 456,
          contentType: 'tv',
          title: 'Adult TV',
          posterUrl: null,
        },
      ];
      mockContentRepo.findAndCount.mockResolvedValue([adultList, 2]);

      const result = await service.getAdultContents(1, 20);

      expect(result.data).toEqual(adultList);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('차단된 콘텐츠가 없으면 빈 배열을 반환해야 한다', async () => {
      mockContentRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getAdultContents();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('toggleAdult', () => {
    it('DB에 콘텐츠가 존재하면 adult 값을 업데이트해야 한다', async () => {
      const existingContent = {
        id: 1,
        tmdbId: 123,
        contentType: 'movie',
        title: 'Test Movie',
        adult: false,
      };
      mockContentRepo.findOne.mockResolvedValue(existingContent);
      mockContentRepo.save.mockImplementation((c: Partial<Content>) =>
        Promise.resolve(c),
      );

      const result = await service.toggleAdult(123, 'movie', true);

      expect(mockContentRepo.findOne).toHaveBeenCalledWith({
        where: { tmdbId: 123, contentType: 'movie' },
      });
      expect(result.adult).toBe(true);
      expect(mockContentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ adult: true }),
      );
      expect(mockRevalidateService.revalidatePaths).toHaveBeenCalledWith([
        '/',
        '/contents/movie/123',
      ]);
    });

    it('DB에 콘텐츠가 없으면 TMDB에서 가져온 후 adult를 설정해야 한다', async () => {
      // toggleAdult 내부 findOne: null (콘텐츠 미존재)
      // findOrFetchByTmdbId 내부 findOne: null (DB 미존재)
      mockContentRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const tmdbData = {
        id: 456,
        title: 'New Movie',
        original_title: 'New Movie',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      };
      mockTmdbService.getDetails.mockResolvedValue(tmdbData);

      const fetchedContent = {
        id: 2,
        tmdbId: 456,
        contentType: 'movie',
        title: 'New Movie',
        adult: false,
      };
      mockContentRepo.create.mockReturnValue(fetchedContent);
      mockContentRepo.save.mockImplementation((c: Partial<Content>) =>
        Promise.resolve(c),
      );

      const result = await service.toggleAdult(456, 'movie', true);

      expect(mockTmdbService.getDetails).toHaveBeenCalledWith(456, 'movie');
      expect(result.adult).toBe(true);
      expect(mockRevalidateService.revalidatePaths).toHaveBeenCalledWith([
        '/',
        '/contents/movie/456',
      ]);
    });

    it('차단 해제 시 adult를 false로 설정해야 한다', async () => {
      const existingContent = {
        id: 1,
        tmdbId: 789,
        contentType: 'tv',
        title: 'Adult TV Show',
        adult: true,
      };
      mockContentRepo.findOne.mockResolvedValue(existingContent);
      mockContentRepo.save.mockImplementation((c: Partial<Content>) =>
        Promise.resolve(c),
      );

      const result = await service.toggleAdult(789, 'tv', false);

      expect(result.adult).toBe(false);
      expect(mockRevalidateService.revalidatePaths).toHaveBeenCalledWith([
        '/',
        '/contents/tv/789',
      ]);
    });
  });

  describe('searchContents - 차단 필터링', () => {
    it('타입 지정 검색 시 차단된 콘텐츠를 결과에서 제외해야 한다', async () => {
      mockContentRepo.find.mockResolvedValue([
        { tmdbId: 2, contentType: 'movie' },
      ]);

      const searchResult = {
        page: 1,
        total_pages: 1,
        total_results: 3,
        results: [{ id: 1 }, { id: 2 }, { id: 3 }],
      };
      mockTmdbService.searchByType.mockResolvedValue(searchResult);

      const result = await service.searchContents('test', 'movie', 1);

      expect(result.results).toHaveLength(2);
      expect(result.results.map((r: { id: number }) => r.id)).toEqual([1, 3]);
    });

    it('전체 검색 시 같은 타입의 차단된 콘텐츠만 제외해야 한다', async () => {
      mockContentRepo.find.mockResolvedValue([
        { tmdbId: 5, contentType: 'tv' },
      ]);

      const personResult = {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      };
      const movieResult = {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 5 }],
      };
      const tvResult = {
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [{ id: 5 }, { id: 6 }],
      };

      mockTmdbService.searchByType
        .mockResolvedValueOnce(personResult)
        .mockResolvedValueOnce(movieResult)
        .mockResolvedValueOnce(tvResult);

      const result = await service.searchContents('test');

      // tv:5는 차단, movie:5는 유지 (contentType이 다르므로)
      const movieResults = result.results.filter(
        (r: { media_type?: string; id: number }) => r.media_type !== 'person',
      );
      // movie id:5 유지 + tv id:6 유지 = results에 id:5, id:6 포함
      const resultIds = result.results.map((r: { id: number }) => r.id);
      expect(resultIds).toContain(5); // movie:5는 차단 아님
      expect(resultIds).toContain(6); // tv:6도 차단 아님
      expect(result.results).toHaveLength(2); // movie 1개 + tv 1개 (tv:5 제외)
    });
  });

  describe('discoverContents - 차단 필터링', () => {
    it('차단된 콘텐츠를 탐색 결과에서 제외해야 한다', async () => {
      mockContentRepo.find.mockResolvedValue([
        { tmdbId: 10, contentType: 'movie' },
      ]);

      const discoverResult = {
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [{ id: 10 }, { id: 11 }],
      };
      mockTmdbService.discoverByFilters.mockResolvedValue(discoverResult);

      const result = await service.discoverContents('movie', { page: 1 });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe(11);
    });
  });

  describe('getSitemapContents', () => {
    it('adult=true 콘텐츠를 제외하고 tmdbId, contentType, updatedAt을 반환해야 한다', async () => {
      const mockRows = [
        {
          tmdbId: 123,
          contentType: 'movie',
          updatedAt: new Date('2026-03-15'),
        },
        { tmdbId: 456, contentType: 'tv', updatedAt: new Date('2026-03-14') },
      ];
      mockQueryBuilder.getMany.mockResolvedValue(mockRows);

      const result = await service.getSitemapContents();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'c.adult IS NOT TRUE',
      );
      expect(result).toEqual(mockRows);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('tmdbId', 123);
      expect(result[0]).toHaveProperty('contentType', 'movie');
      expect(result[1]).toHaveProperty('tmdbId', 456);
      expect(result[1]).toHaveProperty('contentType', 'tv');
    });

    it('콘텐츠가 없으면 빈 배열을 반환해야 한다', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getSitemapContents();

      expect(result).toEqual([]);
    });
  });

  describe('cleanupExpiredPersonCache', () => {
    it('만료된 인물 캐시 엔트리를 삭제해야 한다', async () => {
      // 캐시에 만료 엔트리를 채우기 위해 getPersonDetail 호출
      const personData = { id: 1, name: 'Actor 1' };
      mockTmdbService.getPersonDetail.mockResolvedValue(personData);
      await service.getPersonDetail(1);

      // 캐시 엔트리의 expiresAt을 과거로 설정하기 위해 다시 호출
      const personData2 = { id: 2, name: 'Actor 2' };
      mockTmdbService.getPersonDetail.mockResolvedValue(personData2);
      await service.getPersonDetail(2);

      // 내부 캐시 접근: personDetailCache에 expiresAt을 강제로 과거로 변경
      const detailCache = (
        service as unknown as {
          personDetailCache: Map<number, { data: unknown; expiresAt: number }>;
        }
      ).personDetailCache;
      const entry1 = detailCache.get(1);
      if (entry1) entry1.expiresAt = Date.now() - 1000; // 만료

      expect(detailCache.size).toBe(2);

      service.cleanupExpiredPersonCache();

      // 만료된 엔트리(id=1)만 삭제, 미만료(id=2) 유지
      expect(detailCache.size).toBe(1);
      expect(detailCache.has(1)).toBe(false);
      expect(detailCache.has(2)).toBe(true);
    });

    it('만료된 credits 캐시 엔트리를 삭제해야 한다', async () => {
      const creditsData = { cast: [], crew: [] };

      // blockedIds 캐시용
      mockContentRepo.find.mockResolvedValue([]);

      mockTmdbService.getPersonCredits.mockResolvedValue(creditsData);
      await service.getPersonCredits(10);
      await service.getPersonCredits(20);

      const creditsCache = (
        service as unknown as {
          personCreditsCache: Map<number, { data: unknown; expiresAt: number }>;
        }
      ).personCreditsCache;
      const entry10 = creditsCache.get(10);
      if (entry10) entry10.expiresAt = Date.now() - 1000; // 만료

      expect(creditsCache.size).toBe(2);

      service.cleanupExpiredPersonCache();

      expect(creditsCache.size).toBe(1);
      expect(creditsCache.has(10)).toBe(false);
      expect(creditsCache.has(20)).toBe(true);
    });

    it('만료된 엔트리가 없으면 아무것도 삭제하지 않아야 한다', async () => {
      const personData = { id: 5, name: 'Actor 5' };
      mockTmdbService.getPersonDetail.mockResolvedValue(personData);
      await service.getPersonDetail(5);

      const detailCache = (
        service as unknown as {
          personDetailCache: Map<number, { data: unknown; expiresAt: number }>;
        }
      ).personDetailCache;
      expect(detailCache.size).toBe(1);

      service.cleanupExpiredPersonCache();

      expect(detailCache.size).toBe(1);
      expect(detailCache.has(5)).toBe(true);
    });
  });

  describe('blockPersonContents', () => {
    const blockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    it('cast와 crew 중복을 제거하고 정상 차단해야 한다', async () => {
      const creditsData = {
        cast: [
          { id: 100, media_type: 'movie', title: 'Movie A' },
          { id: 200, media_type: 'tv', name: 'TV B' },
        ],
        crew: [
          { id: 100, media_type: 'movie', title: 'Movie A', job: 'Director' },
          { id: 300, media_type: 'movie', title: 'Movie C', job: 'Producer' },
        ],
      };
      mockTmdbService.getPersonCredits.mockResolvedValue(creditsData);

      // 일괄 조회: DB에 movie:100, tv:200이 존재 (adult=false)
      const existingContents = [
        { id: 1, tmdbId: 100, contentType: 'movie', adult: false },
        { id: 2, tmdbId: 200, contentType: 'tv', adult: false },
      ];
      mockContentRepo.createQueryBuilder.mockReturnValue(blockQueryBuilder);
      blockQueryBuilder.getMany.mockResolvedValue(existingContents);

      // movie:300은 DB에 없으므로 fetch
      mockContentRepo.findOne.mockResolvedValueOnce(null);
      const fetchedContent = {
        id: 3,
        tmdbId: 300,
        contentType: 'movie',
        adult: false,
      };
      mockTmdbService.getDetails.mockResolvedValue({
        id: 300,
        title: 'Movie C',
        original_title: 'Movie C',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      });
      mockContentRepo.create.mockReturnValue(fetchedContent);
      mockContentRepo.save.mockResolvedValue(fetchedContent);
      mockContentRepo.update.mockResolvedValue({ affected: 3 });
      mockContentRepo.find.mockResolvedValue([
        { tmdbId: 100, contentType: 'movie' },
        { tmdbId: 200, contentType: 'tv' },
        { tmdbId: 300, contentType: 'movie' },
      ]);

      const result = await service.blockPersonContents(12345);

      // 중복 제거: movie:100, tv:200, movie:300 = 3개
      expect(result.total).toBe(3);
      expect(result.blocked).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockContentRepo.update).toHaveBeenCalled();
      expect(mockRevalidateService.revalidatePaths).toHaveBeenCalledWith([
        '/',
        '/contents/movie/100',
        '/contents/tv/200',
        '/contents/movie/300',
      ]);
    });

    it('이미 adult=true인 항목을 건너뛰어야 한다', async () => {
      const creditsData = {
        cast: [
          { id: 100, media_type: 'movie', title: 'Already Blocked' },
          { id: 200, media_type: 'movie', title: 'Not Blocked' },
        ],
        crew: [],
      };
      mockTmdbService.getPersonCredits.mockResolvedValue(creditsData);

      const existingContents = [
        { id: 1, tmdbId: 100, contentType: 'movie', adult: true },
        { id: 2, tmdbId: 200, contentType: 'movie', adult: false },
      ];
      mockContentRepo.createQueryBuilder.mockReturnValue(blockQueryBuilder);
      blockQueryBuilder.getMany.mockResolvedValue(existingContents);
      mockContentRepo.update.mockResolvedValue({ affected: 1 });
      mockContentRepo.find.mockResolvedValue([
        { tmdbId: 200, contentType: 'movie' },
      ]);

      const result = await service.blockPersonContents(99999);

      // id:100은 이미 adult=true → 건너뜀, id:200만 차단
      expect(result.blocked).toBe(1);
      expect(result.total).toBe(2);
      expect(mockRevalidateService.revalidatePaths).toHaveBeenCalledWith([
        '/',
        '/contents/movie/200',
      ]);
    });

    it('TMDB fetch 실패 시 failed 카운트를 증가시키고 계속 진행해야 한다', async () => {
      const creditsData = {
        cast: [
          { id: 100, media_type: 'movie', title: 'Movie A' },
          { id: 200, media_type: 'movie', title: 'Fetch Fail Movie' },
        ],
        crew: [],
      };
      mockTmdbService.getPersonCredits.mockResolvedValue(creditsData);

      // 일괄 조회: DB에 아무것도 없음
      mockContentRepo.createQueryBuilder.mockReturnValue(blockQueryBuilder);
      blockQueryBuilder.getMany.mockResolvedValue([]);

      // movie:100 fetch 성공
      mockContentRepo.findOne.mockResolvedValueOnce(null);
      const fetchedContent = {
        id: 1,
        tmdbId: 100,
        contentType: 'movie',
        adult: false,
      };
      mockTmdbService.getDetails.mockResolvedValueOnce({
        id: 100,
        title: 'Movie A',
        original_title: 'Movie A',
        poster_path: null,
        backdrop_path: null,
        overview: null,
        release_date: null,
        vote_average: null,
        genres: [],
        runtime: null,
        credits: { cast: [] },
        'watch/providers': { results: {} },
      });
      mockContentRepo.create.mockReturnValueOnce(fetchedContent);
      mockContentRepo.save.mockResolvedValueOnce(fetchedContent);

      // movie:200 fetch 실패
      mockContentRepo.findOne.mockResolvedValueOnce(null);
      mockTmdbService.getDetails.mockRejectedValueOnce(
        new Error('TMDB API Error'),
      );

      mockContentRepo.update.mockResolvedValue({ affected: 1 });
      mockContentRepo.find.mockResolvedValue([
        { tmdbId: 100, contentType: 'movie' },
      ]);

      const result = await service.blockPersonContents(11111);

      expect(result.blocked).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(2);
      expect(mockRevalidateService.revalidatePaths).toHaveBeenCalledWith([
        '/',
        '/contents/movie/100',
      ]);
    });
  });
});
