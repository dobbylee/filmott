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
} from '../../integrations/tmdb/tmdb.service';
import { AdultContentService } from './adult-content.service';
const PERSON_CACHE_TTL_MS = 72 * 60 * 60 * 1000;
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
@Injectable()
export class PersonCatalogService {
  private readonly logger = new Logger(PersonCatalogService.name);
  constructor(
    private readonly tmdbService: TmdbService,
    private readonly adultService: AdultContentService,
  ) {}

  private readonly personDetailCache = new Map<
    number,
    CacheEntry<TmdbPersonDetail>
  >();
  private readonly personCreditsCache = new Map<
    number,
    CacheEntry<{ cast: TmdbPersonCredit[]; crew: TmdbPersonCredit[] }>
  >();

  private canUseStalePersonCache(error: unknown): boolean {
    return (
      error instanceof GatewayTimeoutException ||
      isTmdbConnectionResetError(error)
    );
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
