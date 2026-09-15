import * as Sentry from '@sentry/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Ranking } from '../ranking.entity';
import { RankingsSyncService } from './rankings-sync.service';
import {
  getLastWeekTargetDate,
  getYesterdayTargetDate,
} from '../rankings-date.util';
import { summarizeExternalApiError } from '../../common/external-api-error.util';
@Injectable()
export class RankingsSchedulerService {
  private readonly logger = new Logger(RankingsSchedulerService.name);
  constructor(
    @InjectRepository(Ranking)
    private readonly rankingRepo: Repository<Ranking>,
    private readonly syncService: RankingsSyncService,
  ) {}

  private static readonly DAILY_BOX_OFFICE_CATEGORY = 'daily-box-office';

  private static readonly WEEKLY_BOX_OFFICE_CATEGORY = 'weekly-box-office';

  private static readonly KOBIS_SOURCE = 'kobis';

  /**
   * KOBIS 일별 박스오피스 조기 1차 수집
   * 매일 00:05 실행 (전일자 데이터)
   */
  @Cron('5 0 * * *', {
    name: 'daily-box-office-midnight',
    timeZone: 'Asia/Seoul',
  })
  async scheduleDailyBoxOfficeMidnight(): Promise<Ranking[]> {
    return this.syncService.fetchDailyBoxOffice(
      'daily-box-office-midnight',
      'warn',
    );
  }

  /**
   * KOBIS 일별 박스오피스 1차 재시도
   * 매일 00:25 실행 (전일 랭킹이 10건 미만일 때 재시도)
   */
  @Cron('25 0 * * *', {
    name: 'daily-box-office-retry',
    timeZone: 'Asia/Seoul',
  })
  async retryDailyBoxOfficeIfMissing(): Promise<Ranking[] | void> {
    const targetDate = getYesterdayTargetDate();
    const existingCount = await this.rankingRepo.count({
      where: {
        source: RankingsSchedulerService.KOBIS_SOURCE,
        category: RankingsSchedulerService.DAILY_BOX_OFFICE_CATEGORY,
        targetDate,
      },
    });

    if (existingCount >= 10) {
      this.logger.log(
        `Daily box office already exists for ${targetDate}, skipping retry`,
        {
          trigger: 'daily-box-office-retry',
          targetDate,
          existingCount,
        },
      );
      return;
    }

    this.logger.warn(
      `Daily box office missing for ${targetDate}, running retry`,
      {
        trigger: 'daily-box-office-retry',
        targetDate,
        existingCount,
      },
    );
    return this.syncService.fetchDailyBoxOffice(
      'daily-box-office-retry',
      'warn',
    );
  }

  /**
   * KOBIS 일별 박스오피스 안정화 수집
   * 매일 01:00 실행 (데이터 존재 여부와 무관하게 재수집/업서트)
   */
  @Cron('0 1 * * *', {
    name: 'daily-box-office-stabilization',
    timeZone: 'Asia/Seoul',
  })
  async scheduleDailyBoxOfficeStabilization(): Promise<Ranking[]> {
    return this.syncService.fetchDailyBoxOffice(
      'daily-box-office-stabilization',
      'report',
    );
  }

  /**
   * KOBIS 일별 박스오피스 2차 보정
   * 매일 12:00 실행 (같은 targetDate 재수집/업서트)
   */
  @Cron('0 12 * * *', {
    name: 'daily-box-office-noon',
    timeZone: 'Asia/Seoul',
  })
  async scheduleDailyBoxOfficeNoon(): Promise<Ranking[]> {
    return this.syncService.fetchDailyBoxOffice(
      'daily-box-office-noon',
      'report',
    );
  }

  /**
   * KOBIS 주간 박스오피스 1차 수집
   * 매주 월요일 00:30 실행 (전주 데이터)
   */
  @Cron('30 0 * * 1', {
    name: 'weekly-box-office',
    timeZone: 'Asia/Seoul',
  })
  async scheduleWeeklyBoxOffice(): Promise<Ranking[]> {
    return this.syncService.fetchWeeklyBoxOffice(
      'weekly-box-office-primary',
      'warn',
    );
  }

  /**
   * KOBIS 주간 박스오피스 조건부 재시도
   * 매주 월요일 01:30 실행 (전주 랭킹이 10건 미만일 때 재시도)
   */
  @Cron('30 1 * * 1', {
    name: 'weekly-box-office-retry',
    timeZone: 'Asia/Seoul',
  })
  async retryWeeklyBoxOfficeIfMissing(): Promise<Ranking[] | void> {
    const targetDate = getLastWeekTargetDate();
    let existingCount: number;
    try {
      existingCount = await this.rankingRepo.count({
        where: {
          source: RankingsSchedulerService.KOBIS_SOURCE,
          category: RankingsSchedulerService.WEEKLY_BOX_OFFICE_CATEGORY,
          targetDate,
        },
      });
    } catch (error) {
      const errorSummary = {
        ...summarizeExternalApiError('DATABASE', error),
        trigger: 'weekly-box-office-retry',
        operation: 'weekly-box-office-completeness-check',
        targetDate,
      };
      this.logger.error(
        'Failed to check weekly box office completeness',
        errorSummary,
      );
      Sentry.captureException(errorSummary);
      return [];
    }

    if (existingCount >= 10) {
      this.logger.log(
        `Weekly box office already exists for ${targetDate}, skipping retry`,
        {
          trigger: 'weekly-box-office-retry',
          targetDate,
          existingCount,
        },
      );
      return;
    }

    this.logger.warn(
      `Weekly box office incomplete for ${targetDate}, running retry`,
      {
        trigger: 'weekly-box-office-retry',
        targetDate,
        existingCount,
      },
    );
    return this.syncService.fetchWeeklyBoxOffice(
      'weekly-box-office-retry',
      'report',
    );
  }
  @Cron('0 6 * * *', { name: 'daily-trending', timeZone: 'Asia/Seoul' })
  async fetchAllTrending(): Promise<void> {
    return this.syncService.fetchAllTrending();
  }
  @Cron('0 7 * * *', { name: 'korean-tv-discover', timeZone: 'Asia/Seoul' })
  async fetchKoreanTvDiscover(): Promise<void> {
    return this.syncService.fetchKoreanTvDiscover();
  }
}
