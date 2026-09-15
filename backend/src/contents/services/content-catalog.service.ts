import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from '../content.entity';
import { TmdbService, TmdbItem } from '../../integrations/tmdb/tmdb.service';
import {
  TMDB_IMAGE_BASE,
  GENRE_NAME_MAP,
  CONTENT_DETAIL_TTL_MS,
} from '../../common/constants';
import { ContentIndexingService } from './content-indexing.service';

const NEGATIVE_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TMDB_ID = 20_000_000;

@Injectable()
export class ContentCatalogService {
  private readonly logger = new Logger(ContentCatalogService.name);
  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly tmdbService: TmdbService,
    private readonly indexingService: ContentIndexingService,
  ) {}

  private readonly refreshingIds = new Set<string>();
  private readonly missingDetailCache = new Map<string, number>();

  /**
   * DB에서 캐시 히트 시 반환, 미스 시 TMDB에서 fetch하여 저장 후 반환
   */
  async findOrFetchByTmdbId(
    tmdbId: number,
    type: 'movie' | 'tv',
    signal?: AbortSignal,
  ): Promise<Content> {
    const signalArgs: [] | [AbortSignal] = signal ? [signal] : [];
    const existing = await this.contentRepo.findOne({
      where: { tmdbId, contentType: type },
    });
    signal?.throwIfAborted();

    if (existing) {
      return existing;
    }

    const tmdbData = await this.tmdbService.getDetails(
      tmdbId,
      type,
      ...signalArgs,
    );
    signal?.throwIfAborted();
    return this.saveFromTmdb(tmdbData, type);
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
        return this.toDetailResponse(
          cached,
          cached.watchProviders,
          cached.credits,
        );
      }

      // TTL 초과: 캐시 즉시 반환 + 백그라운드 갱신
      this.refreshInBackground(tmdbId, type);
      return this.toDetailResponse(
        cached,
        cached.watchProviders,
        cached.credits,
      );
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

  private async toDetailResponse(
    content: Content,
    watchProviders = content.watchProviders ?? null,
    credits = content.credits ?? [],
  ) {
    const response = {
      ...content,
      watchProviders,
      credits,
    };
    const searchIndexable = await this.indexingService.isContentSearchIndexable(
      content.id,
    );

    return {
      ...response,
      searchIndexable,
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
