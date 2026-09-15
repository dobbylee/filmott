import { Injectable } from '@nestjs/common';
import { TmdbService } from '../../integrations/tmdb/tmdb.service';
import { DISCOVER_TMDB_PROVIDER_IDS } from '../../common/ott-providers';
import { AdultContentService } from './adult-content.service';
@Injectable()
export class ContentDiscoveryService {
  constructor(
    private readonly tmdbService: TmdbService,
    private readonly adultService: AdultContentService,
  ) {}

  /**
   * 검색: TMDB API 호출 후 결과 반환 (캐싱은 하지 않음, 목록은 가볍게)
   */
  async searchContents(
    query: string,
    type?: 'movie' | 'tv' | 'person',
    page = 1,
    signal?: AbortSignal,
  ) {
    const signalArgs: [] | [AbortSignal] = signal ? [signal] : [];
    const blockedIds = await this.adultService.getBlockedTmdbIds();
    signal?.throwIfAborted();

    if (type === 'person') {
      return this.tmdbService.searchByType(query, type, page, ...signalArgs);
    }

    if (type === 'movie' || type === 'tv') {
      const result = await this.tmdbService.searchByType(
        query,
        type,
        page,
        ...signalArgs,
      );
      signal?.throwIfAborted();
      const originalCount = result.results.length;
      result.results = result.results.filter(
        (item) => !blockedIds.has(`${type}:${item.id}`),
      );
      const removed = originalCount - result.results.length;
      result.total_results = Math.max(0, result.total_results - removed);
      return result;
    }

    // "전체" 검색: 인물(page 1 고정) + 영화/시리즈(페이징) 각각 호출
    const [personResult, movieResult, tvResult] = await Promise.all([
      this.tmdbService.searchByType(query, 'person', 1, ...signalArgs),
      this.tmdbService.searchByType(query, 'movie', page, ...signalArgs),
      this.tmdbService.searchByType(query, 'tv', page, ...signalArgs),
    ]);
    signal?.throwIfAborted();

    const filteredMovies = movieResult.results.filter(
      (item) => !blockedIds.has(`movie:${item.id}`),
    );
    const filteredTv = tvResult.results.filter(
      (item) => !blockedIds.has(`tv:${item.id}`),
    );

    const movieRemoved = movieResult.results.length - filteredMovies.length;
    const tvRemoved = tvResult.results.length - filteredTv.length;
    const contentTotal =
      movieResult.total_results +
      tvResult.total_results -
      movieRemoved -
      tvRemoved;

    return {
      page,
      total_pages: Math.max(movieResult.total_pages, tvResult.total_pages),
      total_results: personResult.total_results + contentTotal,
      personTotal: personResult.total_results,
      contentTotal,
      results: [...personResult.results, ...filteredMovies, ...filteredTv],
    };
  }

  /**
   * 필터 기반 탐색
   */
  async discoverContents(
    type: 'movie' | 'tv' = 'movie',
    options: {
      genres?: string;
      providers?: string;
      year?: number;
      sort?: string;
      page?: number;
    } = {},
  ) {
    const watchProviders =
      options.providers && options.providers.trim().length > 0
        ? options.providers
        : DISCOVER_TMDB_PROVIDER_IDS.join('|');

    const [result, blockedIds] = await Promise.all([
      this.tmdbService.discoverByFilters(type, {
        genres: options.genres,
        watchProviders,
        year: options.year,
        sort: options.sort,
        page: options.page,
      }),
      this.adultService.getBlockedTmdbIds(),
    ]);
    const originalCount = result.results.length;
    result.results = result.results.filter(
      (item) => !blockedIds.has(`${type}:${item.id}`),
    );
    const removed = originalCount - result.results.length;
    result.total_results = Math.max(0, result.total_results - removed);
    return result;
  }
}
