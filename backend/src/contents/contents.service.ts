import { AdultContentService } from './services/adult-content.service';
import { ContentCatalogService } from './services/content-catalog.service';
import {
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  isTmdbConnectionResetError,
  isTmdbNotFoundError,
  TmdbService,
  TmdbPersonDetail,
  TmdbPersonCredit,
} from '../tmdb/tmdb.service';
import { DISCOVER_TMDB_PROVIDER_IDS } from '../common/ott-providers';
import {
  ContentIndexingService,
  type GoogleSitemapCohort,
} from './services/content-indexing.service';

const PERSON_CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72시간
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);
  private readonly personDetailCache = new Map<
    number,
    CacheEntry<TmdbPersonDetail>
  >();
  private readonly personCreditsCache = new Map<
    number,
    CacheEntry<{ cast: TmdbPersonCredit[]; crew: TmdbPersonCredit[] }>
  >();

  constructor(
    private readonly tmdbService: TmdbService,
    private readonly adultService: AdultContentService,
    private readonly indexingService: ContentIndexingService,
    private readonly catalogService: ContentCatalogService,
  ) {}

  private canUseStalePersonCache(error: unknown): boolean {
    return (
      error instanceof GatewayTimeoutException ||
      isTmdbConnectionResetError(error)
    );
  }

  findOrFetchByTmdbId(
    tmdbId: number,
    type: 'movie' | 'tv',
    signal?: AbortSignal,
  ) {
    return this.catalogService.findOrFetchByTmdbId(tmdbId, type, signal);
  }

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

  getContentDetail(tmdbId: number, type: 'movie' | 'tv') {
    return this.catalogService.getContentDetail(tmdbId, type);
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

  /**
   * 인물 상세 정보 (72시간 TTL 캐시)
   */
  async getPersonDetail(personId: number): Promise<TmdbPersonDetail> {
    const cached = this.personDetailCache.get(personId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    try {
      const data = await this.tmdbService.getPersonDetail(personId);
      this.personDetailCache.set(personId, {
        data,
        expiresAt: Date.now() + PERSON_CACHE_TTL_MS,
      });
      return data;
    } catch (error) {
      if (isTmdbNotFoundError(error)) {
        throw new NotFoundException(`인물을 찾을 수 없습니다: ${personId}`);
      }

      if (cached && this.canUseStalePersonCache(error)) {
        this.logger.warn(
          `TMDB 인물 상세 일시적 요청 실패, stale cache 사용 (${personId})`,
        );
        return cached.data;
      }
      throw error;
    }
  }

  /**
   * 인물 필모그래피 (movie/tv만, 최신순 정렬, 72시간 TTL 캐시)
   */
  async getPersonCredits(personId: number): Promise<{
    cast: TmdbPersonCredit[];
    crew: TmdbPersonCredit[];
  }> {
    let raw: { cast: TmdbPersonCredit[]; crew: TmdbPersonCredit[] };
    const cached = this.personCreditsCache.get(personId);
    if (cached && Date.now() < cached.expiresAt) {
      raw = cached.data;
    } else {
      try {
        raw = await this.tmdbService.getPersonCredits(personId);
        this.personCreditsCache.set(personId, {
          data: raw,
          expiresAt: Date.now() + PERSON_CACHE_TTL_MS,
        });
      } catch (error) {
        if (isTmdbNotFoundError(error)) {
          throw new NotFoundException(`인물을 찾을 수 없습니다: ${personId}`);
        }

        if (cached && this.canUseStalePersonCache(error)) {
          this.logger.warn(
            `TMDB 인물 크레딧 일시적 요청 실패, stale cache 사용 (${personId})`,
          );
          raw = cached.data;
        } else {
          throw error;
        }
      }
    }

    const blockedIds = await this.adultService.getBlockedTmdbIds();

    const filterAndSort = (items: TmdbPersonCredit[]) => {
      return items
        .filter(
          (item) =>
            (item.media_type === 'movie' || item.media_type === 'tv') &&
            !blockedIds.has(`${item.media_type}:${item.id}`),
        )
        .sort((a, b) => {
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.localeCompare(dateA);
        });
    };

    return {
      cast: filterAndSort(raw.cast),
      crew: filterAndSort(raw.crew),
    };
  }

  getSitemapContents() {
    return this.indexingService.getSitemapContents();
  }

  getGoogleSitemapContents(cohort: GoogleSitemapCohort) {
    return this.indexingService.getGoogleSitemapContents(cohort);
  }

  getAdultContents(page = 1, limit = 20) {
    return this.adultService.getAdultContents(page, limit);
  }

  toggleAdult(tmdbId: number, contentType: 'movie' | 'tv', adult: boolean) {
    return this.adultService.toggleAdult(tmdbId, contentType, adult);
  }

  blockPersonContents(personId: number) {
    return this.adultService.blockPersonContents(personId);
  }

  @Cron('0 */6 * * *', { name: 'person-cache-cleanup', timeZone: 'Asia/Seoul' })
  cleanupExpiredPersonCache(): void {
    const now = Date.now();
    let detailRemoved = 0;
    let creditsRemoved = 0;

    for (const [key, entry] of this.personDetailCache) {
      if (now >= entry.expiresAt) {
        this.personDetailCache.delete(key);
        detailRemoved++;
      }
    }
    for (const [key, entry] of this.personCreditsCache) {
      if (now >= entry.expiresAt) {
        this.personCreditsCache.delete(key);
        creditsRemoved++;
      }
    }

    if (detailRemoved > 0 || creditsRemoved > 0) {
      this.logger.log(
        `인물 캐시 정리: detail ${detailRemoved}건, credits ${creditsRemoved}건 제거 ` +
          `(남은: detail ${this.personDetailCache.size}, credits ${this.personCreditsCache.size})`,
      );
    }
  }
}
