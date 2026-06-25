import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { summarizeExternalApiError } from '../common/external-api-error.util';

export interface KobisBoxOfficeItem {
  rank: string;
  movieNm: string;
  movieCd: string;
  openDt: string;
  audiCnt: string;
  audiAcc: string;
  salesAmt: string;
  salesAcc: string;
}

export interface KobisBoxOfficeResult {
  boxOfficeResult: {
    boxofficeType: string;
    showRange: string;
    dailyBoxOfficeList?: KobisBoxOfficeItem[];
    weeklyBoxOfficeList?: KobisBoxOfficeItem[];
  };
}

function getElapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

@Injectable()
export class KobisService {
  private readonly logger = new Logger(KobisService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * KOBIS 일별 박스오피스 조회
   * @param targetDt YYYYMMDD 형식 (예: '20260309')
   */
  async getDailyBoxOffice(targetDt: string): Promise<KobisBoxOfficeItem[]> {
    const startedAt = Date.now();

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<KobisBoxOfficeResult>(
          '/boxoffice/searchDailyBoxOfficeList.json',
          { params: { targetDt } },
        ),
      );

      const items = data.boxOfficeResult.dailyBoxOfficeList ?? [];
      this.logger.log('KOBIS daily box office request succeeded', {
        targetDt,
        durationMs: getElapsedMs(startedAt),
        itemCount: items.length,
      });
      return items;
    } catch (error) {
      this.logger.error(`Failed to fetch daily box office for ${targetDt}`, {
        ...summarizeExternalApiError(
          'KOBIS',
          error,
          '/boxoffice/searchDailyBoxOfficeList.json',
        ),
        targetDt,
        durationMs: getElapsedMs(startedAt),
      });
      throw error;
    }
  }

  /**
   * KOBIS 주간 박스오피스 조회
   * @param targetDt YYYYMMDD 형식
   * @param weekGb 0: 주간, 1: 주말, 2: 주중
   */
  async getWeeklyBoxOffice(
    targetDt: string,
    weekGb: '0' | '1' | '2' = '0',
  ): Promise<KobisBoxOfficeItem[]> {
    const startedAt = Date.now();

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<KobisBoxOfficeResult>(
          '/boxoffice/searchWeeklyBoxOfficeList.json',
          { params: { targetDt, weekGb } },
        ),
      );

      const items = data.boxOfficeResult.weeklyBoxOfficeList ?? [];
      this.logger.log('KOBIS weekly box office request succeeded', {
        targetDt,
        weekGb,
        durationMs: getElapsedMs(startedAt),
        itemCount: items.length,
      });
      return items;
    } catch (error) {
      this.logger.error(`Failed to fetch weekly box office for ${targetDt}`, {
        ...summarizeExternalApiError(
          'KOBIS',
          error,
          '/boxoffice/searchWeeklyBoxOfficeList.json',
        ),
        targetDt,
        weekGb,
        durationMs: getElapsedMs(startedAt),
      });
      throw error;
    }
  }
}
