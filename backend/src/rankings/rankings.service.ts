import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Ranking } from './ranking.entity';
import { KobisService } from '../kobis/kobis.service';
import { TmdbService } from '../tmdb/tmdb.service';
import { ContentsService } from '../contents/contents.service';
import { Content } from '../contents/content.entity';
import { TMDB_IMAGE_BASE } from '../common/constants';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TMDB_CALL_DELAY_MS = 250;

@Injectable()
export class RankingsService {
  private readonly logger = new Logger(RankingsService.name);

  private readonly revalidateSecret: string;

  constructor(
    @InjectRepository(Ranking)
    private readonly rankingRepo: Repository<Ranking>,
    private readonly kobisService: KobisService,
    private readonly tmdbService: TmdbService,
    private readonly contentsService: ContentsService,
    private readonly configService: ConfigService,
  ) {
    this.revalidateSecret = this.configService.get<string>('REVALIDATE_SECRET', '');
  }

  /**
   * KOBIS 일별 박스오피스를 가져와 rankings에 저장
   * 매일 00:10 + 12:00 실행 (전일자 데이터, KOBIS 보정 반영)
   */
  @Cron('10 0 * * *', { name: 'daily-box-office-midnight', timeZone: 'Asia/Seoul' })
  @Cron('0 12 * * *', { name: 'daily-box-office-noon', timeZone: 'Asia/Seoul' })
  async fetchDailyBoxOffice(): Promise<Ranking[]> {
    const yesterday = this.getYesterdayDate();
    const targetDate = this.formatDateWithDashes(yesterday);
    this.logger.log(`Fetching daily box office for ${yesterday}`);

    try {
      const boxOfficeItems = await this.kobisService.getDailyBoxOffice(yesterday);
      const fetchedAt = new Date();

      // TMDB 매칭을 순차 처리 (rate limit 방어: 250ms 간격)
      const matchResults: PromiseSettledResult<{ id: number; posterUrl?: string } | null>[] = [];
      for (const item of boxOfficeItems) {
        try {
          const value = await this.matchKobisToTmdb(item.movieNm, item.openDt);
          matchResults.push({ status: 'fulfilled', value });
        } catch (reason) {
          matchResults.push({ status: 'rejected', reason });
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

      this.logger.log(`Saved ${rankingsToUpsert.length} daily box office rankings`);
      await this.revalidateMainPage();
      return rankingsToUpsert;
    } catch (error) {
      this.logger.error('Failed to fetch daily box office', error);
      throw error;
    }
  }

  /**
   * KOBIS 주간 박스오피스를 가져와 rankings에 저장
   * 매주 월요일 오전 10시 실행 (전주 데이터)
   */
  @Cron('0 10 * * 1', { name: 'weekly-box-office', timeZone: 'Asia/Seoul' })
  async fetchWeeklyBoxOffice(): Promise<Ranking[]> {
    const lastWeek = this.getLastWeekDate();
    const targetDate = this.formatDateWithDashes(lastWeek);
    this.logger.log(`Fetching weekly box office for ${lastWeek}`);

    try {
      const boxOfficeItems = await this.kobisService.getWeeklyBoxOffice(lastWeek);
      const fetchedAt = new Date();

      // TMDB 매칭을 순차 처리 (rate limit 방어: 250ms 간격)
      const matchResults: PromiseSettledResult<{ id: number; posterUrl?: string } | null>[] = [];
      for (const item of boxOfficeItems) {
        try {
          const value = await this.matchKobisToTmdb(item.movieNm, item.openDt);
          matchResults.push({ status: 'fulfilled', value });
        } catch (reason) {
          matchResults.push({ status: 'rejected', reason });
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

      this.logger.log(`Saved ${rankingsToUpsert.length} weekly box office rankings`);
      await this.revalidateMainPage();
      return rankingsToUpsert;
    } catch (error) {
      this.logger.error('Failed to fetch weekly box office', error);
      throw error;
    }
  }

  /**
   * TMDB 트렌딩을 가져와 rankings에 저장
   * 매일 오전 6시 실행: 모든 trending 카테고리 갱신
   */
  @Cron('0 6 * * *', { name: 'daily-trending', timeZone: 'Asia/Seoul' })
  async fetchAllTrending(): Promise<void> {
    const categories: { type: 'movie' | 'tv' | 'all'; timeWindow: 'day' | 'week' }[] = [
      { type: 'all', timeWindow: 'day' },
      { type: 'all', timeWindow: 'week' },
    ];

    for (const { type, timeWindow } of categories) {
      try {
        await this.fetchTrending(type, timeWindow);
      } catch (error) {
        this.logger.error(`Failed to fetch trending-${type}-${timeWindow}`, error);
      }
    }
  }

  async fetchTrending(
    type: 'movie' | 'tv' | 'all' = 'all',
    timeWindow: 'day' | 'week' = 'day',
  ): Promise<Ranking[]> {
    const category = `trending-${type}-${timeWindow}`;
    const targetDate = this.getTodayDate();
    this.logger.log(`Fetching trending: ${category}`);

    try {
      const trendingData = await this.tmdbService.getTrending(type, timeWindow);
      const fetchedAt = new Date();

      // contents 테이블 캐싱을 순차 처리 (rate limit 방어: 250ms 간격)
      const cacheResults: PromiseSettledResult<Content>[] = [];
      for (const item of trendingData.results) {
        const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
        try {
          const value = await this.contentsService.findOrFetchByTmdbId(
            item.id,
            mediaType as 'movie' | 'tv',
          );
          cacheResults.push({ status: 'fulfilled', value });
        } catch (reason) {
          cacheResults.push({ status: 'rejected', reason });
        }
        await sleep(TMDB_CALL_DELAY_MS);
      }

      const rankingsToUpsert: Ranking[] = trendingData.results.map((item, i) => {
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
      });

      await this.rankingRepo.upsert(rankingsToUpsert, [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);

      this.logger.log(`Saved ${rankingsToUpsert.length} trending rankings for ${category}`);
      await this.revalidateMainPage();
      return rankingsToUpsert;
    } catch (error) {
      this.logger.error(`Failed to fetch trending: ${category}`, error);
      throw error;
    }
  }

  /**
   * 최신 랭킹 조회 (content 정보 join)
   */
  async getRankings(
    source: string,
    category: string,
    limit = 10,
  ): Promise<Ranking[]> {
    // 해당 source+category의 최신 fetchedAt 조회
    const latestRecord = await this.rankingRepo.findOne({
      where: { source, category },
      order: { fetchedAt: 'DESC' },
      select: ['fetchedAt'],
    });

    if (!latestRecord) {
      return [];
    }

    return this.rankingRepo.find({
      where: {
        source,
        category,
        fetchedAt: latestRecord.fetchedAt,
      },
      relations: ['content'],
      order: { rank: 'ASC' },
      take: limit,
    });
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
        const yearMatch = openYear && releaseYear
          ? Math.abs(releaseYear - openYear) <= 1
          : true;

        return titleMatch && yearMatch;
      });

      // 완전 매칭 없으면 첫 번째 결과 사용 (제목 유사도 높은 순)
      const bestMatch = matched ?? searchResult.results[0];

      // contents 테이블에 캐싱
      const content = await this.contentsService.findOrFetchByTmdbId(
        bestMatch.id,
        'movie',
      );

      return { id: content.id, posterUrl: content.posterUrl };
    } catch (error) {
      this.logger.warn(`TMDB matching failed for: ${movieNm}`, error);
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

  private getLastWeekDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).replace(/-/g, '');
  }

  private getYesterdayDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    // Asia/Seoul 기준 YYYYMMDD
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).replace(/-/g, '');
  }

  private getTodayDate(): string {
    // Asia/Seoul 기준 YYYY-MM-DD
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  }

  /**
   * YYYYMMDD -> YYYY-MM-DD 변환
   */
  private formatDateWithDashes(dateStr: string): string {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }

  private async revalidateMainPage(): Promise<void> {
    if (!this.revalidateSecret) return;
    try {
      const url = 'http://frontend:3000/internal/revalidate';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.revalidateSecret}`,
        },
        body: JSON.stringify({ path: '/' }),
      });
      if (!response.ok) {
        this.logger.warn(`메인 페이지 캐시 갱신 실패: HTTP ${response.status}`);
        return;
      }
      this.logger.log('메인 페이지 캐시 갱신 완료');
    } catch {
      this.logger.warn('메인 페이지 캐시 갱신 실패 (무시)');
    }
  }
}
