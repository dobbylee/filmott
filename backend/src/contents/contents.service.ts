import { ContentCatalogService } from './services/content-catalog.service';
import {
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { In, Repository } from 'typeorm';
import { Content } from './content.entity';
import {
  isTmdbConnectionResetError,
  isTmdbNotFoundError,
  TmdbService,
  TmdbPersonDetail,
  TmdbPersonCredit,
} from '../tmdb/tmdb.service';
import { RevalidateService } from '../common/revalidate.service';
import { DISCOVER_TMDB_PROVIDER_IDS } from '../common/ott-providers';
import {
  ContentIndexingService,
  type GoogleSitemapCohort,
} from './services/content-indexing.service';

const BLOCKED_IDS_TTL_MS = 5 * 60 * 1000; // 5분
const PERSON_CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72시간
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface BlockedContentRow {
  tmdbId: number | string;
  contentType: string;
}

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);
  private blockedIdsCache: CacheEntry<Set<string>> | null = null;
  private readonly personDetailCache = new Map<
    number,
    CacheEntry<TmdbPersonDetail>
  >();
  private readonly personCreditsCache = new Map<
    number,
    CacheEntry<{ cast: TmdbPersonCredit[]; crew: TmdbPersonCredit[] }>
  >();

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly tmdbService: TmdbService,
    private readonly revalidateService: RevalidateService,
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
    const blockedIds = await this.getBlockedTmdbIds();
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
      this.getBlockedTmdbIds(),
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

    const blockedIds = await this.getBlockedTmdbIds();

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

  /**
   * 차단된 콘텐츠 목록 조회 (관리자용)
   */
  async getAdultContents(
    page = 1,
    limit = 20,
  ): Promise<{
    data: Pick<
      Content,
      'id' | 'tmdbId' | 'contentType' | 'title' | 'posterUrl'
    >[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const [data, total] = await this.contentRepo.findAndCount({
      where: { adult: true },
      select: ['id', 'tmdbId', 'contentType', 'title', 'posterUrl'],
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * 관리자 수동 성인물 차단/해제
   */
  async toggleAdult(
    tmdbId: number,
    contentType: 'movie' | 'tv',
    adult: boolean,
  ): Promise<Content> {
    let content = await this.contentRepo.findOne({
      where: { tmdbId, contentType },
    });

    if (!content) {
      content = await this.catalogService.findOrFetchByTmdbId(
        tmdbId,
        contentType,
      );
    }

    content.adult = adult;
    const saved = await this.contentRepo.save(content);
    this.invalidateBlockedIdsCache();
    await this.revalidateService.revalidatePaths([
      '/',
      `/contents/${contentType}/${tmdbId}`,
    ]);
    return saved;
  }

  /**
   * 인물의 전체 작품 일괄 차단 (관리자용)
   */
  async blockPersonContents(personId: number): Promise<{
    blocked: number;
    failed: number;
    total: number;
    blockedContents: { tmdbId: number; contentType: string }[];
  }> {
    const credits = await this.tmdbService.getPersonCredits(personId);
    const allCredits = [...credits.cast, ...credits.crew].filter(
      (item) => item.media_type === 'movie' || item.media_type === 'tv',
    );

    // 중복 제거 (같은 작품에 cast+crew 양쪽 존재 가능)
    const unique = new Map<string, TmdbPersonCredit>();
    for (const item of allCredits) {
      unique.set(`${item.media_type}:${item.id}`, item);
    }

    // 일괄 조회: DB에 이미 존재하는 콘텐츠
    const uniqueEntries = [...unique.values()];
    const existingContents =
      uniqueEntries.length > 0
        ? await this.contentRepo
            .createQueryBuilder('c')
            .where(
              uniqueEntries
                .map(
                  (_, i) =>
                    `(c.tmdb_id = :tmdbId${i} AND c.content_type = :type${i})`,
                )
                .join(' OR '),
              Object.fromEntries(
                uniqueEntries.flatMap((item, i) => [
                  [`tmdbId${i}`, item.id],
                  [`type${i}`, item.media_type],
                ]),
              ) as Record<string, number | string>,
            )
            .getMany()
        : [];

    const existingMap = new Map<string, Content>();
    for (const c of existingContents) {
      existingMap.set(`${c.contentType}:${c.tmdbId}`, c);
    }

    // 이미 adult=true인 항목 제외, 차단 대상 분류
    const toBlockIds: number[] = [];
    const toFetch: TmdbPersonCredit[] = [];

    for (const item of unique.values()) {
      const key = `${item.media_type}:${item.id}`;
      const existing = existingMap.get(key);
      if (existing) {
        if (!existing.adult) {
          toBlockIds.push(existing.id);
        }
      } else {
        toFetch.push(item);
      }
    }

    // DB에 없는 항목은 개별 fetch (TMDB API 호출 불가피)
    let failed = 0;
    for (const item of toFetch) {
      const type = item.media_type as 'movie' | 'tv';
      try {
        const content = await this.catalogService.findOrFetchByTmdbId(
          item.id,
          type,
        );
        if (!content.adult) {
          toBlockIds.push(content.id);
        }
      } catch {
        failed++;
      }
    }

    // 일괄 update (updatedAt 수동 갱신 — update()는 @UpdateDateColumn 미동작)
    if (toBlockIds.length > 0) {
      await this.contentRepo.update(
        { id: In(toBlockIds) },
        { adult: true, updatedAt: new Date() },
      );
      this.invalidateBlockedIdsCache();
    }

    // 차단된 콘텐츠 정보 반환 (프론트에서 캐시 무효화용)
    const blockedContents =
      toBlockIds.length > 0
        ? await this.contentRepo.find({
            where: { id: In(toBlockIds) },
            select: ['tmdbId', 'contentType'],
          })
        : [];

    if (blockedContents.length > 0) {
      await this.revalidateService.revalidatePaths([
        '/',
        ...blockedContents.map(
          (content) => `/contents/${content.contentType}/${content.tmdbId}`,
        ),
      ]);
    }

    return {
      blocked: toBlockIds.length,
      failed,
      total: unique.size,
      blockedContents: blockedContents.map((c) => ({
        tmdbId: c.tmdbId,
        contentType: c.contentType,
      })),
    };
  }

  private async getBlockedTmdbIds(): Promise<Set<string>> {
    if (this.blockedIdsCache && Date.now() < this.blockedIdsCache.expiresAt) {
      return this.blockedIdsCache.data;
    }
    const blocked = await this.contentRepo
      .createQueryBuilder('content')
      .select('content.tmdbId', 'tmdbId')
      .addSelect('content.contentType', 'contentType')
      .where('content.adult = true')
      .getRawMany<BlockedContentRow>();
    const data = new Set(blocked.map((c) => `${c.contentType}:${c.tmdbId}`));
    this.blockedIdsCache = { data, expiresAt: Date.now() + BLOCKED_IDS_TTL_MS };
    return data;
  }

  private invalidateBlockedIdsCache(): void {
    this.blockedIdsCache = null;
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
