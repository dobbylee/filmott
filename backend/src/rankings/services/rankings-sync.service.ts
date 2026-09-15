import {
  getLastWeekDate,
  getYesterdayDate,
  getTodayDate,
  formatDateWithDashes,
} from '../rankings-date.util';
import type {
  DailyBoxOfficeTrigger,
  DailyBoxOfficeFailurePolicy,
  WeeklyBoxOfficeTrigger,
  WeeklyBoxOfficeFailurePolicy,
} from '../rankings-sync.types';
import { RANKINGS_REVALIDATE_TAGS } from '../rankings.constants';
import * as Sentry from '@sentry/nestjs';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ranking } from '../ranking.entity';
import { KobisService } from '../../integrations/kobis/kobis.service';
import { TmdbService } from '../../integrations/tmdb/tmdb.service';
import { ContentCatalogService } from '../../contents/services/content-catalog.service';
import { ContentMetadataService } from '../../recommendation/content-metadata.service';
import { RevalidateService } from '../../common/revalidate.service';
import { Content } from '../../contents/content.entity';
import { TMDB_IMAGE_BASE } from '../../common/constants';
import { summarizeExternalApiError } from '../../common/external-api-error.util';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TMDB_CALL_DELAY_MS = 250;

@Injectable()
export class RankingsSyncService {
  private readonly logger = new Logger(RankingsSyncService.name);

  constructor(
    @InjectRepository(Ranking)
    private readonly rankingRepo: Repository<Ranking>,
    private readonly kobisService: KobisService,
    private readonly tmdbService: TmdbService,
    private readonly contentCatalogService: ContentCatalogService,
    private readonly metadataService: ContentMetadataService,
    private readonly revalidateService: RevalidateService,
  ) {}

  /**
   * KOBIS 일별 박스오피스를 가져와 rankings에 저장
   * 수동 실행 및 스케줄러 공용
   */
  async fetchDailyBoxOffice(
    trigger: DailyBoxOfficeTrigger = 'manual-refresh',
    failurePolicy: DailyBoxOfficeFailurePolicy = 'throw',
  ): Promise<Ranking[]> {
    const startedAt = Date.now();
    const yesterday = getYesterdayDate();
    const targetDate = formatDateWithDashes(yesterday);
    this.logger.log(`Fetching daily box office for ${yesterday}`, {
      trigger,
      targetDt: yesterday,
      targetDate,
    });

    try {
      const boxOfficeItems =
        await this.kobisService.getDailyBoxOffice(yesterday);
      const fetchedAt = new Date();

      // TMDB 매칭을 순차 처리 (rate limit 방어: 250ms 간격)
      const matchResults: PromiseSettledResult<{
        id: number;
        posterUrl?: string;
      } | null>[] = [];
      for (const item of boxOfficeItems) {
        try {
          const value = await this.matchKobisToTmdb(item.movieNm, item.openDt);
          matchResults.push({ status: 'fulfilled', value });
        } catch (reason) {
          const error =
            reason instanceof Error ? reason : new Error(String(reason));
          matchResults.push({ status: 'rejected', reason: error });
        }
        await sleep(TMDB_CALL_DELAY_MS);
      }

      const rankingsToUpsert: Ranking[] = boxOfficeItems.map((item, idx) => {
        const ranking = this.rankingRepo.create({
          source: 'kobis',
          category: 'daily-box-office',
          rank: parseInt(item.rank, 10),
          title: item.movieNm,
          audienceCount: parseInt(item.audiAcc, 10) || undefined,
          targetDate,
          fetchedAt,
        });

        const result = matchResults[idx];
        if (result.status === 'fulfilled' && result.value) {
          ranking.contentId = result.value.id;
          ranking.posterUrl = result.value.posterUrl;
        }

        return ranking;
      });

      await this.rankingRepo.upsert(rankingsToUpsert, [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);

      this.logger.log(
        `Saved ${rankingsToUpsert.length} daily box office rankings`,
        {
          trigger,
          targetDt: yesterday,
          targetDate,
          itemCount: boxOfficeItems.length,
          savedCount: rankingsToUpsert.length,
          durationMs: Date.now() - startedAt,
        },
      );

      const contentIds = rankingsToUpsert
        .map((r) => r.contentId)
        .filter((id): id is number => id !== undefined);
      if (contentIds.length > 0) {
        this.cacheMetadataInBackground(contentIds);
      }

      await this.revalidateService.revalidatePath(
        '/',
        RANKINGS_REVALIDATE_TAGS,
      );
      return rankingsToUpsert;
    } catch (error) {
      const errorSummary = {
        ...summarizeExternalApiError('KOBIS', error),
        trigger,
        targetDt: yesterday,
        targetDate,
        durationMs: Date.now() - startedAt,
      };
      if (failurePolicy === 'warn') {
        this.logger.warn('Failed to fetch daily box office', errorSummary);
      } else {
        this.logger.error('Failed to fetch daily box office', errorSummary);
        Sentry.captureException(errorSummary);
      }

      if (failurePolicy === 'throw') {
        throw new BadGatewayException(
          'KOBIS 일별 박스오피스 조회에 실패했습니다.',
        );
      }

      return [];
    }
  }

  /**
   * KOBIS 주간 박스오피스를 가져와 rankings에 저장
   * 수동 실행 및 스케줄러 공용
   */
  async fetchWeeklyBoxOffice(
    trigger: WeeklyBoxOfficeTrigger = 'manual-refresh',
    failurePolicy: WeeklyBoxOfficeFailurePolicy = 'throw',
  ): Promise<Ranking[]> {
    const startedAt = Date.now();
    const lastWeek = getLastWeekDate();
    const targetDate = formatDateWithDashes(lastWeek);
    this.logger.log(`Fetching weekly box office for ${lastWeek}`, {
      trigger,
      targetDt: lastWeek,
      targetDate,
    });

    try {
      const boxOfficeItems =
        await this.kobisService.getWeeklyBoxOffice(lastWeek);
      const fetchedAt = new Date();

      // TMDB 매칭을 순차 처리 (rate limit 방어: 250ms 간격)
      const matchResults: PromiseSettledResult<{
        id: number;
        posterUrl?: string;
      } | null>[] = [];
      for (const item of boxOfficeItems) {
        try {
          const value = await this.matchKobisToTmdb(item.movieNm, item.openDt);
          matchResults.push({ status: 'fulfilled', value });
        } catch (reason) {
          const error =
            reason instanceof Error ? reason : new Error(String(reason));
          matchResults.push({ status: 'rejected', reason: error });
        }
        await sleep(TMDB_CALL_DELAY_MS);
      }

      const rankingsToUpsert: Ranking[] = boxOfficeItems.map((item, idx) => {
        const ranking = this.rankingRepo.create({
          source: 'kobis',
          category: 'weekly-box-office',
          rank: parseInt(item.rank, 10),
          title: item.movieNm,
          audienceCount: parseInt(item.audiAcc, 10) || undefined,
          targetDate,
          fetchedAt,
        });

        const result = matchResults[idx];
        if (result.status === 'fulfilled' && result.value) {
          ranking.contentId = result.value.id;
          ranking.posterUrl = result.value.posterUrl;
        }

        return ranking;
      });

      await this.rankingRepo.upsert(rankingsToUpsert, [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);

      this.logger.log(
        `Saved ${rankingsToUpsert.length} weekly box office rankings`,
        {
          trigger,
          targetDt: lastWeek,
          targetDate,
          itemCount: boxOfficeItems.length,
          savedCount: rankingsToUpsert.length,
          durationMs: Date.now() - startedAt,
        },
      );

      const contentIds = rankingsToUpsert
        .map((r) => r.contentId)
        .filter((id): id is number => id !== undefined);
      if (contentIds.length > 0) {
        this.cacheMetadataInBackground(contentIds);
      }

      await this.revalidateService.revalidatePath(
        '/',
        RANKINGS_REVALIDATE_TAGS,
      );
      return rankingsToUpsert;
    } catch (error) {
      const errorSummary = {
        ...summarizeExternalApiError('KOBIS', error),
        trigger,
        targetDt: lastWeek,
        targetDate,
        durationMs: Date.now() - startedAt,
      };
      if (failurePolicy === 'warn') {
        this.logger.warn('Failed to fetch weekly box office', errorSummary);
      } else {
        this.logger.error('Failed to fetch weekly box office', errorSummary);
        Sentry.captureException(errorSummary);
      }

      if (failurePolicy === 'throw') {
        throw new BadGatewayException(
          'KOBIS 주간 박스오피스 조회에 실패했습니다.',
        );
      }

      return [];
    }
  }
  async fetchAllTrending(): Promise<void> {
    const categories: {
      type: 'movie' | 'tv' | 'all';
      timeWindow: 'day' | 'week';
    }[] = [
      { type: 'all', timeWindow: 'day' },
      { type: 'all', timeWindow: 'week' },
    ];

    for (const { type, timeWindow } of categories) {
      try {
        await this.fetchTrending(type, timeWindow);
      } catch (error) {
        const errorSummary = summarizeExternalApiError('TMDB', error);
        this.logger.error(
          `Failed to fetch trending-${type}-${timeWindow}`,
          errorSummary,
        );
        Sentry.captureException(errorSummary);
      }
    }

    await this.revalidateService.revalidatePath('/', RANKINGS_REVALIDATE_TAGS);
  }

  /** revalidation은 호출자 책임 — fetchAllTrending()에서 일괄 처리 */
  async fetchTrending(
    type: 'movie' | 'tv' | 'all' = 'all',
    timeWindow: 'day' | 'week' = 'day',
  ): Promise<Ranking[]> {
    const category = `trending-${type}-${timeWindow}`;
    const targetDate = getTodayDate();
    this.logger.log(`Fetching trending: ${category}`);

    try {
      const trendingData = await this.tmdbService.getTrending(type, timeWindow);
      const fetchedAt = new Date();

      // contents 테이블 캐싱을 순차 처리 (rate limit 방어: 250ms 간격)
      const cacheResults: PromiseSettledResult<Content>[] = [];
      for (const item of trendingData.results) {
        const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
        try {
          const value = await this.contentCatalogService.findOrFetchByTmdbId(
            item.id,
            mediaType,
          );
          cacheResults.push({ status: 'fulfilled', value });
        } catch (reason) {
          const error =
            reason instanceof Error ? reason : new Error(String(reason));
          cacheResults.push({ status: 'rejected', reason: error });
        }
        await sleep(TMDB_CALL_DELAY_MS);
      }

      const rankingsToUpsert: Ranking[] = trendingData.results.map(
        (item, i) => {
          const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
          const title = mediaType === 'movie' ? item.title : item.name;
          const posterUrl = item.poster_path
            ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
            : undefined;

          let contentId: number | undefined;
          const cacheResult = cacheResults[i];
          if (cacheResult.status === 'fulfilled') {
            contentId = cacheResult.value.id;
          } else {
            this.logger.warn(
              `Failed to cache trending content: ${title} (tmdb:${item.id})`,
            );
          }

          return this.rankingRepo.create({
            source: 'tmdb',
            category,
            rank: i + 1,
            title: title ?? undefined,
            posterUrl,
            contentId,
            targetDate,
            fetchedAt,
          });
        },
      );

      await this.rankingRepo.upsert(rankingsToUpsert, [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);

      this.logger.log(
        `Saved ${rankingsToUpsert.length} trending rankings for ${category}`,
      );

      // TMDB trending은 글로벌 기준이라 한국에서 볼 수 없는 작품도 섞일 수 있다.
      // 랭킹 저장은 유지하되, 채팅 metadata 증식은 KR 구독형 OTT 제공작으로 제한한다.
      const contentIds = cacheResults
        .filter(
          (result): result is PromiseFulfilledResult<Content> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value)
        .filter((content) => this.hasKoreanFlatrateProvider(content))
        .map((content) => content.id);
      if (contentIds.length > 0) {
        this.cacheMetadataInBackground(contentIds);
      }

      return rankingsToUpsert;
    } catch (error) {
      this.logger.error(
        `Failed to fetch trending: ${category}`,
        summarizeExternalApiError('TMDB', error),
      );
      throw error;
    }
  }

  async refreshTrending(
    type: 'movie' | 'tv' | 'all',
    timeWindow: 'day' | 'week',
  ): Promise<Ranking[]> {
    const rankings = await this.fetchTrending(type, timeWindow);
    await this.revalidateService.revalidatePath('/', RANKINGS_REVALIDATE_TAGS);
    return rankings;
  }

  /**
   * KOBIS 영화명 + 개봉연도를 기반으로 TMDB에서 매칭
   */
  private async matchKobisToTmdb(
    movieNm: string,
    openDt: string,
  ): Promise<{ id: number; posterUrl?: string } | null> {
    try {
      const searchResult = await this.tmdbService.searchByType(
        movieNm,
        'movie',
        1,
      );

      if (!searchResult.results.length) {
        this.logger.warn(`No TMDB match found for: ${movieNm}`);
        return null;
      }

      // 개봉연도 추출 (KOBIS openDt: "2024-01-15" or "20240115")
      const openYear = this.extractYear(openDt);

      // 제목 + 연도 매칭
      const matched = searchResult.results.find((item) => {
        const releaseYear = item.release_date
          ? new Date(item.release_date).getFullYear()
          : null;

        // 제목 완전 일치 또는 연도 일치
        const titleMatch =
          item.title === movieNm || item.original_title === movieNm;
        const yearMatch =
          openYear && releaseYear
            ? Math.abs(releaseYear - openYear) <= 1
            : true;

        return titleMatch && yearMatch;
      });

      // 완전 매칭 없으면 첫 번째 결과 사용 (제목 유사도 높은 순)
      const bestMatch = matched ?? searchResult.results[0];

      // contents 테이블에 캐싱
      const content = await this.contentCatalogService.findOrFetchByTmdbId(
        bestMatch.id,
        'movie',
      );

      return { id: content.id, posterUrl: content.posterUrl };
    } catch (error) {
      this.logger.warn(
        `TMDB matching failed for: ${movieNm}`,
        summarizeExternalApiError('TMDB', error),
      );
      return null;
    }
  }

  private extractYear(dateStr: string): number | null {
    if (!dateStr) return null;
    // "2024-01-15" or "20240115"
    const cleaned = dateStr.replace(/-/g, '');
    if (cleaned.length >= 4) {
      return parseInt(cleaned.substring(0, 4), 10);
    }
    return null;
  }
  async fetchKoreanTvDiscover(): Promise<void> {
    this.logger.log('Fetching Korean TV Discover');

    try {
      const today = new Date();
      const sixMonthsAgo = new Date(today);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const airDateLte = today.toLocaleDateString('en-CA', {
        timeZone: 'Asia/Seoul',
      });
      const airDateGte = sixMonthsAgo.toLocaleDateString('en-CA', {
        timeZone: 'Asia/Seoul',
      });

      // 1-2 페이지 순차 수집
      const allResults: { id: number }[] = [];
      for (const page of [1, 2]) {
        const discoverData = await this.tmdbService.discoverByFilters('tv', {
          originCountry: 'KR',
          sort: 'first_air_date.desc',
          airDateLte,
          airDateGte,
          page,
        });
        allResults.push(
          ...discoverData.results.map((item) => ({ id: item.id })),
        );
        await sleep(TMDB_CALL_DELAY_MS);
      }

      this.logger.log(`Korean TV Discover: ${allResults.length}건 수집`);

      // contents 캐싱 (250ms 간격)
      const contentIds: number[] = [];
      let failCount = 0;
      for (const item of allResults) {
        try {
          const content = await this.contentCatalogService.findOrFetchByTmdbId(
            item.id,
            'tv',
          );
          contentIds.push(content.id);
        } catch {
          failCount++;
        }
        await sleep(TMDB_CALL_DELAY_MS);
      }

      this.logger.log(
        `Korean TV Discover: 수집 ${allResults.length}건, 캐싱 성공 ${contentIds.length}건, 실패 ${failCount}건`,
      );

      // metadata 비동기 캐싱
      if (contentIds.length > 0) {
        this.cacheMetadataInBackground(contentIds);
      }
    } catch (error) {
      const errorSummary = summarizeExternalApiError('TMDB', error);
      this.logger.error('Failed to fetch Korean TV Discover', errorSummary);
      Sentry.captureException(errorSummary);
    }
  }

  private cacheMetadataInBackground(contentIds: number[]): void {
    this.metadataService
      .batchCacheByContentIds(contentIds)
      .then((result) => {
        this.logger.log(
          `Metadata 배치 캐싱 완료: cached=${result.cached}, skipped=${result.skipped}, failed=${result.failed}`,
        );
      })
      .catch((error) => {
        this.logger.warn(
          `Metadata 배치 캐싱 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  private hasKoreanFlatrateProvider(content: Content): boolean {
    return (content.watchProviders?.flatrate?.length ?? 0) > 0;
  }
}
