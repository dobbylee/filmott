import {
  GatewayTimeoutException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { In, Repository } from 'typeorm';
import { Content } from './content.entity';
import {
  TmdbService,
  TmdbItem,
  TmdbPersonDetail,
  TmdbPersonCredit,
} from '../tmdb/tmdb.service';
import {
  TMDB_IMAGE_BASE,
  GENRE_NAME_MAP,
  CONTENT_DETAIL_TTL_MS,
} from '../common/constants';
import { RevalidateService } from '../common/revalidate.service';

const BLOCKED_IDS_TTL_MS = 5 * 60 * 1000; // 5분
const PERSON_CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72시간
const NEGATIVE_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const MAX_TMDB_ID = 20_000_000;
const SITEMAP_CONTENT_LIMIT = 10_000;
const SITEMAP_MIN_VOTE_COUNT = 100;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface SitemapContentRow {
  tmdbId: number | string;
  contentType: string;
  lastModified: Date | string;
}

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);
  private readonly refreshingIds = new Set<string>();
  private blockedIdsCache: CacheEntry<Set<string>> | null = null;
  private readonly personDetailCache = new Map<
    number,
    CacheEntry<TmdbPersonDetail>
  >();
  private readonly personCreditsCache = new Map<
    number,
    CacheEntry<{ cast: TmdbPersonCredit[]; crew: TmdbPersonCredit[] }>
  >();
  private readonly missingDetailCache = new Map<string, number>();

  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly tmdbService: TmdbService,
    private readonly revalidateService: RevalidateService,
  ) {}

  /**
   * DB에서 캐시 히트 시 반환, 미스 시 TMDB에서 fetch하여 저장 후 반환
   */
  async findOrFetchByTmdbId(
    tmdbId: number,
    type: 'movie' | 'tv',
  ): Promise<Content> {
    const existing = await this.contentRepo.findOne({
      where: { tmdbId, contentType: type },
    });

    if (existing) {
      return existing;
    }

    const tmdbData = await this.tmdbService.getDetails(tmdbId, type);
    return this.saveFromTmdb(tmdbData, type);
  }

  /**
   * 검색: TMDB API 호출 후 결과 반환 (캐싱은 하지 않음, 목록은 가볍게)
   */
  async searchContents(
    query: string,
    type?: 'movie' | 'tv' | 'person',
    page = 1,
  ) {
    const blockedIds = await this.getBlockedTmdbIds();

    if (type === 'person') {
      return this.tmdbService.searchByType(query, type, page);
    }

    if (type === 'movie' || type === 'tv') {
      const result = await this.tmdbService.searchByType(query, type, page);
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
      this.tmdbService.searchByType(query, 'person', 1),
      this.tmdbService.searchByType(query, 'movie', page),
      this.tmdbService.searchByType(query, 'tv', page),
    ]);

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
   * 상세: TTL 이내면 DB 캐시 반환, 초과 시 백그라운드 갱신 + 캐시 즉시 반환
   * 캐시 미스(신규 콘텐츠)인 경우만 동기 호출
   */
  async getContentDetail(tmdbId: number, type: 'movie' | 'tv') {
    this.assertValidTmdbId(tmdbId);

    // DB에서 기존 캐시 확인
    const cached = await this.contentRepo.findOne({
      where: { tmdbId, contentType: type },
    });

    if (cached && cached.credits !== null) {
      const age = Date.now() - new Date(cached.updatedAt).getTime();

      if (age < CONTENT_DETAIL_TTL_MS) {
        // TTL 이내: 캐시 반환
        return {
          ...cached,
          watchProviders: cached.watchProviders,
          credits: cached.credits,
        };
      }

      // TTL 초과: 캐시 즉시 반환 + 백그라운드 갱신
      this.refreshInBackground(tmdbId, type);
      return {
        ...cached,
        watchProviders: cached.watchProviders,
        credits: cached.credits,
      };
    }

    // 캐시 미스(신규 콘텐츠): 동기 호출
    if (!cached) {
      this.throwIfRecentlyMissing(tmdbId, type);
    }

    try {
      return await this.fetchAndSave(tmdbId, type, !cached);
    } catch (error) {
      if (cached) {
        this.logger.warn(
          `상세 보강 실패, 기존 콘텐츠 반환 (${type}:${tmdbId}): ${error instanceof Error ? error.message : String(error)}`,
        );
        return this.toDetailResponse(cached);
      }
      throw error;
    }
  }

  private refreshInBackground(tmdbId: number, type: 'movie' | 'tv'): void {
    const key = `${type}:${tmdbId}`;
    if (this.refreshingIds.has(key)) return;
    this.refreshingIds.add(key);

    this.fetchAndSave(tmdbId, type, false)
      .catch((error) => {
        this.logger.warn(
          `백그라운드 갱신 실패 (${key}): ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => this.refreshingIds.delete(key));
  }

  private async fetchAndSave(
    tmdbId: number,
    type: 'movie' | 'tv',
    rememberMissing: boolean,
  ) {
    let tmdbData;
    try {
      tmdbData = await this.tmdbService.getDetails(tmdbId, type);
    } catch {
      if (rememberMissing) {
        this.rememberMissingDetail(tmdbId, type);
      }
      throw new NotFoundException(
        `콘텐츠를 찾을 수 없습니다: ${type}/${tmdbId}`,
      );
    }

    if (!tmdbData || !tmdbData.id) {
      if (rememberMissing) {
        this.rememberMissingDetail(tmdbId, type);
      }
      throw new NotFoundException(
        `콘텐츠를 찾을 수 없습니다: ${type}/${tmdbId}`,
      );
    }

    const watchProviders = tmdbData['watch/providers']?.results?.KR ?? null;
    const credits = tmdbData.credits?.cast?.slice(0, 20) ?? [];

    const content = await this.upsertFromTmdb(tmdbData, type);
    content.watchProviders = watchProviders;
    content.credits = credits;
    await this.contentRepo.save(content);

    return this.toDetailResponse(content, watchProviders, credits);
  }

  private toDetailResponse(
    content: Content,
    watchProviders = content.watchProviders ?? null,
    credits = content.credits ?? [],
  ) {
    return {
      ...content,
      watchProviders,
      credits,
    };
  }

  private assertValidTmdbId(tmdbId: number): void {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || tmdbId > MAX_TMDB_ID) {
      throw new BadRequestException('유효하지 않은 TMDB ID입니다.');
    }
  }

  private getDetailCacheKey(tmdbId: number, type: 'movie' | 'tv'): string {
    return `${type}:${tmdbId}`;
  }

  private throwIfRecentlyMissing(tmdbId: number, type: 'movie' | 'tv'): void {
    const key = this.getDetailCacheKey(tmdbId, type);
    const expiresAt = this.missingDetailCache.get(key);
    if (!expiresAt) return;

    if (Date.now() < expiresAt) {
      throw new NotFoundException(
        `콘텐츠를 찾을 수 없습니다: ${type}/${tmdbId}`,
      );
    }

    this.missingDetailCache.delete(key);
  }

  private rememberMissingDetail(tmdbId: number, type: 'movie' | 'tv'): void {
    this.missingDetailCache.set(
      this.getDetailCacheKey(tmdbId, type),
      Date.now() + NEGATIVE_DETAIL_CACHE_TTL_MS,
    );
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
    const [result, blockedIds] = await Promise.all([
      this.tmdbService.discoverByFilters(type, {
        genres: options.genres,
        watchProviders: options.providers,
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
      if (cached && error instanceof GatewayTimeoutException) {
        this.logger.warn(
          `TMDB 인물 상세 타임아웃, stale cache 사용 (${personId})`,
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
        if (cached && error instanceof GatewayTimeoutException) {
          this.logger.warn(
            `TMDB 인물 크레딧 타임아웃, stale cache 사용 (${personId})`,
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

  /**
   * 사이트맵용: 색인 가치가 높은 대표 콘텐츠를 안정적인 변경일과 함께 반환
   */
  async getSitemapContents(): Promise<
    Array<{ tmdbId: number; contentType: string; lastModified: Date }>
  > {
    const rows = await this.contentRepo
      .createQueryBuilder('c')
      .select('c.tmdbId', 'tmdbId')
      .addSelect('c.contentType', 'contentType')
      .addSelect(
        'COALESCE(MAX(rv.updated_at), c.release_date::timestamptz, c.created_at)',
        'lastModified',
      )
      .leftJoin('reviews', 'rv', 'rv.content_id = c.id')
      .leftJoin('rankings', 'rk', 'rk.content_id = c.id')
      .where('c.adult IS NOT TRUE')
      .andWhere("NULLIF(BTRIM(c.title), '') IS NOT NULL")
      .andWhere("NULLIF(BTRIM(c.overview), '') IS NOT NULL")
      .andWhere('c.poster_url IS NOT NULL')
      .andWhere('c.release_date IS NOT NULL')
      .andWhere(
        `(${[
          'rv.id IS NOT NULL',
          'rk.id IS NOT NULL',
          'c.watch_providers IS NOT NULL',
          'c.vote_count >= :minVoteCount',
        ].join(' OR ')})`,
        { minVoteCount: SITEMAP_MIN_VOTE_COUNT },
      )
      .groupBy('c.id')
      .orderBy('COUNT(DISTINCT rv.id)', 'DESC')
      .addOrderBy('COUNT(DISTINCT rk.id)', 'DESC')
      .addOrderBy(
        'CASE WHEN c.watch_providers IS NOT NULL THEN 1 ELSE 0 END',
        'DESC',
      )
      .addOrderBy('c.vote_count', 'DESC')
      .addOrderBy(
        'COALESCE(MAX(rv.updated_at), c.release_date::timestamptz, c.created_at)',
        'DESC',
      )
      .limit(SITEMAP_CONTENT_LIMIT)
      .getRawMany<SitemapContentRow>();

    return rows.map((r) => ({
      tmdbId: Number(r.tmdbId),
      contentType: r.contentType,
      lastModified: new Date(r.lastModified),
    }));
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
      content = await this.findOrFetchByTmdbId(tmdbId, contentType);
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
        const content = await this.findOrFetchByTmdbId(item.id, type);
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

  /**
   * TMDB 데이터를 Content 엔티티로 변환하여 저장
   */
  private async saveFromTmdb(
    tmdbData: TmdbItem,
    type: 'movie' | 'tv',
  ): Promise<Content> {
    const content = this.contentRepo.create(
      this.mapTmdbToContent(tmdbData, type),
    );
    content.watchProviders = tmdbData['watch/providers']?.results?.KR ?? null;
    content.credits = tmdbData.credits?.cast?.slice(0, 20) ?? [];
    return this.contentRepo.save(content);
  }

  /**
   * TMDB 데이터를 Content 엔티티로 변환하여 upsert
   */
  private async upsertFromTmdb(
    tmdbData: TmdbItem,
    type: 'movie' | 'tv',
  ): Promise<Content> {
    const mapped = this.mapTmdbToContent(tmdbData, type);

    const existing = await this.contentRepo.findOne({
      where: { tmdbId: tmdbData.id, contentType: type },
    });

    if (existing) {
      const { adult: tmdbAdult, ...fieldsToUpdate } = mapped;
      Object.assign(existing, fieldsToUpdate);
      existing.adult = existing.adult || (tmdbAdult ?? false);
      return this.contentRepo.save(existing);
    }

    const content = this.contentRepo.create(mapped);
    return this.contentRepo.save(content);
  }

  private async getBlockedTmdbIds(): Promise<Set<string>> {
    if (this.blockedIdsCache && Date.now() < this.blockedIdsCache.expiresAt) {
      return this.blockedIdsCache.data;
    }
    const blocked = await this.contentRepo.find({
      where: { adult: true },
      select: ['tmdbId', 'contentType'],
    });
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

  private mapTmdbToContent(
    tmdbData: TmdbItem,
    type: 'movie' | 'tv',
  ): Partial<Content> {
    const title = type === 'movie' ? tmdbData.title : tmdbData.name;
    const originalTitle =
      type === 'movie' ? tmdbData.original_title : tmdbData.original_name;
    const releaseDate =
      type === 'movie' ? tmdbData.release_date : tmdbData.first_air_date;

    // runtime: movie는 직접, tv는 episode_run_time 첫번째 값
    let runtime = tmdbData.runtime ?? null;
    if (type === 'tv' && !runtime && tmdbData.episode_run_time?.length) {
      runtime = tmdbData.episode_run_time[0];
    }

    // 감독 추출 (crew에서 job === 'Director')
    const director =
      tmdbData.credits?.crew
        ?.filter((c) => c.job === 'Director')
        .map((c) => c.name)
        .slice(0, 2)
        .join(', ') || null;

    // 제작 국가 추출
    const originCountryRaw =
      (
        tmdbData.origin_country ??
        tmdbData.production_countries?.map((c) => c.iso_3166_1) ??
        []
      ).join(', ') || null;
    const originCountry =
      originCountryRaw && originCountryRaw.length <= 100
        ? originCountryRaw
        : null;

    return {
      tmdbId: tmdbData.id,
      contentType: type,
      title: title ?? '',
      originalTitle: originalTitle ?? undefined,
      posterUrl: tmdbData.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${tmdbData.poster_path}`
        : undefined,
      backdropUrl: tmdbData.backdrop_path
        ? `${TMDB_IMAGE_BASE}/original${tmdbData.backdrop_path}`
        : undefined,
      overview: tmdbData.overview ?? undefined,
      releaseDate: releaseDate ? new Date(releaseDate) : undefined,
      voteAverage: tmdbData.vote_average ?? undefined,
      voteCount: tmdbData.vote_count ?? 0,
      genres: (tmdbData.genres ?? []).map((g) => ({
        id: g.id,
        name: GENRE_NAME_MAP[g.id] ?? g.name,
      })),
      runtime: runtime ?? undefined,
      director,
      originCountry,
      adult: tmdbData.adult ?? false,
    };
  }
}
