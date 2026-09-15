import { RankingsSchedulerService } from './rankings-scheduler.service';
import * as Sentry from '@sentry/nestjs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadGatewayException, Logger } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import { RankingsSyncService } from './rankings-sync.service';
import { Ranking } from '../ranking.entity';
import { KobisService } from '../../kobis/kobis.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { ContentCatalogService } from '../../contents/services/content-catalog.service';
import { ContentMetadataService } from '../../recommendation/content-metadata.service';
import { RevalidateService } from '../../common/revalidate.service';

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

describe('랭킹 예약', () => {
  let service: RankingsSchedulerService;
  let sync: RankingsSyncService;

  const mockRankingRepo = {
    create: jest.fn(),
    save: jest.fn(),
    upsert: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    count: jest.fn(),
  };

  const mockKobisService = {
    getDailyBoxOffice: jest.fn(),
    getWeeklyBoxOffice: jest.fn(),
  };

  const mockTmdbService = {
    searchByType: jest.fn(),
    getTrending: jest.fn(),
    discoverByFilters: jest.fn(),
  };

  const mockContentCatalogService = {
    findOrFetchByTmdbId: jest.fn(),
  };

  const mockContentMetadataService = {
    batchCacheByContentIds: jest
      .fn()
      .mockResolvedValue({ cached: 0, skipped: 0, failed: 0 }),
  };

  const mockRevalidateService = {
    revalidatePath: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingsSyncService,
        RankingsSchedulerService,
        { provide: getRepositoryToken(Ranking), useValue: mockRankingRepo },
        { provide: KobisService, useValue: mockKobisService },
        { provide: TmdbService, useValue: mockTmdbService },
        { provide: ContentCatalogService, useValue: mockContentCatalogService },
        {
          provide: ContentMetadataService,
          useValue: mockContentMetadataService,
        },
        { provide: RevalidateService, useValue: mockRevalidateService },
      ],
    }).compile();

    service = module.get(RankingsSchedulerService);
    sync = module.get(RankingsSyncService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('daily box office schedulers', () => {
    it('조기 수집 스케줄러가 매일 00:05에 실행되도록 설정되어야 한다', () => {
      const cronMetadata = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        service.scheduleDailyBoxOfficeMidnight,
      ) as { cronTime?: unknown; timeZone?: unknown };

      expect(cronMetadata).toMatchObject({
        cronTime: '5 0 * * *',
        timeZone: 'Asia/Seoul',
      });
    });

    it('1차 재시도 스케줄러가 매일 00:25에 실행되도록 설정되어야 한다', () => {
      const cronMetadata = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        service.retryDailyBoxOfficeIfMissing,
      ) as { cronTime?: unknown; timeZone?: unknown };

      expect(cronMetadata).toMatchObject({
        cronTime: '25 0 * * *',
        timeZone: 'Asia/Seoul',
      });
    });

    it('안정화 수집 스케줄러가 매일 01:00에 실행되도록 설정되어야 한다', () => {
      const cronMetadata = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        service.scheduleDailyBoxOfficeStabilization,
      ) as { cronTime?: unknown; timeZone?: unknown };

      expect(cronMetadata).toMatchObject({
        cronTime: '0 1 * * *',
        timeZone: 'Asia/Seoul',
      });
    });

    it('조기 수집 스케줄러가 warning 정책으로 수집해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(sync, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.scheduleDailyBoxOfficeMidnight();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'daily-box-office-midnight',
        'warn',
      );
    });

    it('1차 재시도 스케줄러는 전일 데이터가 이미 있으면 수집하지 않아야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(10);
      const fetchSpy = jest
        .spyOn(sync, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.retryDailyBoxOfficeIfMissing();

      expect(mockRankingRepo.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          source: 'kobis',
          category: 'daily-box-office',
          targetDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('1차 재시도 스케줄러는 전일 데이터가 없으면 수집해야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(0);
      const fetchSpy = jest
        .spyOn(sync, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.retryDailyBoxOfficeIfMissing();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('daily-box-office-retry', 'warn');
    });

    it('1차 재시도 스케줄러는 전일 데이터가 9건이면 다시 수집해야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(9);
      const fetchSpy = jest
        .spyOn(sync, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.retryDailyBoxOfficeIfMissing();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('daily-box-office-retry', 'warn');
    });

    it('정오 스케줄러가 fetchDailyBoxOffice를 호출해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(sync, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.scheduleDailyBoxOfficeNoon();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('daily-box-office-noon', 'report');
    });

    it('01:00 안정화 수집은 전일 데이터 존재 여부와 무관하게 항상 실행해야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(10);
      const fetchSpy = jest
        .spyOn(sync, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.scheduleDailyBoxOfficeStabilization();

      expect(mockRankingRepo.count).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'daily-box-office-stabilization',
        'report',
      );
    });

    it('조기 수집 실패는 warning만 남기고 Sentry에 보고하지 않아야 한다', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation();
      const error = new AxiosError(
        'Request failed with key=kobis-message-key',
        'ECONNABORTED',
        {
          headers: new AxiosHeaders({
            Authorization: 'Bearer kobis-auth-token',
          }),
          url: '/boxoffice/searchDailyBoxOfficeList.json?key=kobis-query-key',
          params: { key: 'kobis-param-key', targetDt: '20260429' },
        },
      );
      mockKobisService.getDailyBoxOffice.mockRejectedValue(error);

      await expect(service.scheduleDailyBoxOfficeMidnight()).resolves.toEqual(
        [],
      );

      const payload = JSON.stringify(loggerSpy.mock.calls);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to fetch daily box office',
        expect.objectContaining({
          trigger: 'daily-box-office-midnight',
          code: 'ECONNABORTED',
        }),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(payload).not.toContain('kobis-message-key');
      expect(payload).not.toContain('kobis-auth-token');
      expect(payload).not.toContain('kobis-query-key');
      expect(payload).not.toContain('kobis-param-key');
      expect(payload).not.toContain('Authorization');
    });

    it('1차 재시도 실패는 warning만 남기고 Sentry에 보고하지 않아야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(0);
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation();
      const error = new AxiosError(
        'Request failed with key=kobis-message-key',
        'ECONNABORTED',
        {
          headers: new AxiosHeaders({
            Authorization: 'Bearer kobis-auth-token',
          }),
          url: '/boxoffice/searchDailyBoxOfficeList.json?key=kobis-query-key',
          params: { key: 'kobis-param-key', targetDt: '20260429' },
        },
      );
      mockKobisService.getDailyBoxOffice.mockRejectedValue(error);

      await expect(service.retryDailyBoxOfficeIfMissing()).resolves.toEqual([]);

      const payload = JSON.stringify(loggerSpy.mock.calls);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to fetch daily box office',
        expect.objectContaining({
          trigger: 'daily-box-office-retry',
          code: 'ECONNABORTED',
        }),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(payload).not.toContain('kobis-message-key');
      expect(payload).not.toContain('kobis-auth-token');
      expect(payload).not.toContain('kobis-query-key');
      expect(payload).not.toContain('kobis-param-key');
      expect(payload).not.toContain('Authorization');
    });

    it('01:00 안정화 수집 실패는 정제된 정보만 Sentry에 보고해야 한다', async () => {
      const error = new AxiosError(
        'Request failed with key=kobis-message-key',
        'ECONNABORTED',
        {
          headers: new AxiosHeaders({
            Authorization: 'Bearer kobis-auth-token',
          }),
          url: '/boxoffice/searchDailyBoxOfficeList.json?key=kobis-query-key',
          params: { key: 'kobis-param-key', targetDt: '20260429' },
        },
      );
      mockKobisService.getDailyBoxOffice.mockRejectedValue(error);

      await expect(
        service.scheduleDailyBoxOfficeStabilization(),
      ).resolves.toEqual([]);

      const payload = JSON.stringify(
        (Sentry.captureException as jest.Mock).mock.calls,
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'daily-box-office-stabilization',
          code: 'ECONNABORTED',
        }),
      );
      expect(payload).not.toContain('kobis-message-key');
      expect(payload).not.toContain('kobis-auth-token');
      expect(payload).not.toContain('kobis-query-key');
      expect(payload).not.toContain('kobis-param-key');
      expect(payload).not.toContain('Authorization');
    });

    it('조기 수집 실패 후 1차 재시도가 성공하면 전일 랭킹을 저장하고 캐시를 갱신해야 한다', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      mockRankingRepo.count.mockResolvedValue(0);
      const kobisItems = [
        {
          rank: '1',
          movieNm: '복구 영화',
          movieCd: '20260001',
          openDt: '2026-07-01',
          audiCnt: '10000',
          audiAcc: '50000',
          salesAmt: '100000000',
          salesAcc: '500000000',
        },
      ];
      mockKobisService.getDailyBoxOffice
        .mockRejectedValueOnce(new Error('KOBIS 일시 지연'))
        .mockResolvedValueOnce(kobisItems);
      mockTmdbService.searchByType.mockResolvedValue({ results: [] });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await expect(service.scheduleDailyBoxOfficeMidnight()).resolves.toEqual(
        [],
      );
      await expect(
        service.retryDailyBoxOfficeIfMissing(),
      ).resolves.toHaveLength(1);

      expect(mockKobisService.getDailyBoxOffice).toHaveBeenCalledTimes(2);
      expect(mockRankingRepo.upsert).toHaveBeenCalledWith(expect.any(Array), [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith('/', [
        'rankings',
      ]);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('조기 수집과 1차 재시도가 모두 실패해도 01:00 안정화 수집으로 다시 시도해야 한다', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      mockRankingRepo.count.mockResolvedValue(0);
      const kobisItems = [
        {
          rank: '1',
          movieNm: '안정화 영화',
          movieCd: '20260002',
          openDt: '2026-07-01',
          audiCnt: '20000',
          audiAcc: '60000',
          salesAmt: '200000000',
          salesAcc: '600000000',
        },
      ];
      mockKobisService.getDailyBoxOffice
        .mockRejectedValueOnce(new Error('00:05 수집 실패'))
        .mockRejectedValueOnce(new Error('00:25 재시도 실패'))
        .mockResolvedValueOnce(kobisItems);
      mockTmdbService.searchByType.mockResolvedValue({ results: [] });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await expect(service.scheduleDailyBoxOfficeMidnight()).resolves.toEqual(
        [],
      );
      await expect(service.retryDailyBoxOfficeIfMissing()).resolves.toEqual([]);
      await expect(
        service.scheduleDailyBoxOfficeStabilization(),
      ).resolves.toHaveLength(1);

      expect(mockKobisService.getDailyBoxOffice).toHaveBeenCalledTimes(3);
      expect(mockRankingRepo.count).toHaveBeenCalledTimes(1);
      expect(mockRankingRepo.upsert).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('조기 수집 데이터가 있으면 00:25는 건너뛰고 01:00은 안정화 수집해야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(10);
      const fetchSpy = jest
        .spyOn(sync, 'fetchDailyBoxOffice')
        .mockResolvedValue([]);

      await service.retryDailyBoxOfficeIfMissing();
      await service.scheduleDailyBoxOfficeStabilization();

      expect(mockRankingRepo.count).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'daily-box-office-stabilization',
        'report',
      );
    });
  });

  describe('weekly box office schedulers', () => {
    it('1차 수집 스케줄러가 매주 월요일 00:30에 실행되도록 설정되어야 한다', () => {
      const cronMetadata = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        service.scheduleWeeklyBoxOffice,
      ) as { cronTime?: unknown; name?: unknown; timeZone?: unknown };

      expect(cronMetadata).toMatchObject({
        cronTime: '30 0 * * 1',
        name: 'weekly-box-office',
        timeZone: 'Asia/Seoul',
      });
    });

    it('조건부 재시도 스케줄러가 매주 월요일 01:30에 실행되도록 설정되어야 한다', () => {
      const cronMetadata = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        service.retryWeeklyBoxOfficeIfMissing,
      ) as { cronTime?: unknown; name?: unknown; timeZone?: unknown };

      expect(cronMetadata).toMatchObject({
        cronTime: '30 1 * * 1',
        name: 'weekly-box-office-retry',
        timeZone: 'Asia/Seoul',
      });
    });

    it('1차 수집 스케줄러가 warning 정책으로 수집해야 한다', async () => {
      const fetchSpy = jest
        .spyOn(sync, 'fetchWeeklyBoxOffice')
        .mockResolvedValue([]);

      await service.scheduleWeeklyBoxOffice();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'weekly-box-office-primary',
        'warn',
      );
    });

    it('조건부 재시도는 전주 랭킹이 10건 이상이면 수집하지 않아야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(10);
      const fetchSpy = jest
        .spyOn(sync, 'fetchWeeklyBoxOffice')
        .mockResolvedValue([]);

      await service.retryWeeklyBoxOfficeIfMissing();

      expect(mockRankingRepo.count).toHaveBeenCalledWith({
        where: {
          source: 'kobis',
          category: 'weekly-box-office',
          targetDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('조건부 재시도 전 완성도 조회 실패는 Sentry에 한 번 보고하고 예외를 던지지 않아야 한다', async () => {
      mockRankingRepo.count.mockRejectedValue(
        new Error('주간 랭킹 완성도 조회 실패'),
      );
      const fetchSpy = jest
        .spyOn(sync, 'fetchWeeklyBoxOffice')
        .mockResolvedValue([]);

      await expect(service.retryWeeklyBoxOfficeIfMissing()).resolves.toEqual(
        [],
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'DATABASE',
          trigger: 'weekly-box-office-retry',
          operation: 'weekly-box-office-completeness-check',
          targetDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });

    it.each([0, 9])(
      '조건부 재시도는 전주 랭킹이 %i건이면 다시 수집해야 한다',
      async (existingCount) => {
        mockRankingRepo.count.mockResolvedValue(existingCount);
        const fetchSpy = jest
          .spyOn(sync, 'fetchWeeklyBoxOffice')
          .mockResolvedValue([]);

        await service.retryWeeklyBoxOfficeIfMissing();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith(
          'weekly-box-office-retry',
          'report',
        );
      },
    );

    it('1차 수집 실패는 warning만 남기고 Sentry에 보고하지 않아야 한다', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation();
      mockKobisService.getWeeklyBoxOffice.mockRejectedValue(
        new Error('KOBIS 주간 조회 일시 지연'),
      );

      await expect(service.scheduleWeeklyBoxOffice()).resolves.toEqual([]);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to fetch weekly box office',
        expect.objectContaining({
          trigger: 'weekly-box-office-primary',
          targetDt: expect.stringMatching(/^\d{8}$/),
          targetDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('조건부 재시도 실패는 Sentry에 한 번 보고하고 예외를 던지지 않아야 한다', async () => {
      mockRankingRepo.count.mockResolvedValue(0);
      mockKobisService.getWeeklyBoxOffice.mockRejectedValue(
        new Error('KOBIS 주간 조회 재시도 실패'),
      );

      await expect(service.retryWeeklyBoxOfficeIfMissing()).resolves.toEqual(
        [],
      );

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'weekly-box-office-retry',
          message: 'KOBIS 주간 조회 재시도 실패',
          targetDt: expect.stringMatching(/^\d{8}$/),
          targetDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });

    it('1차 수집 실패 후 조건부 재시도가 성공하면 전주 랭킹을 저장해야 한다', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      mockRankingRepo.count.mockResolvedValue(0);
      const kobisItems = [
        {
          rank: '1',
          movieNm: '주간 복구 영화',
          movieCd: '20260003',
          openDt: '2026-07-01',
          audiCnt: '30000',
          audiAcc: '70000',
          salesAmt: '300000000',
          salesAcc: '700000000',
        },
      ];
      mockKobisService.getWeeklyBoxOffice
        .mockRejectedValueOnce(new Error('00:30 수집 실패'))
        .mockResolvedValueOnce(kobisItems);
      mockTmdbService.searchByType.mockResolvedValue({ results: [] });
      mockRankingRepo.create.mockImplementation((data: object) => ({
        ...data,
      }));
      mockRankingRepo.upsert.mockResolvedValue(undefined);

      await expect(service.scheduleWeeklyBoxOffice()).resolves.toEqual([]);
      await expect(
        service.retryWeeklyBoxOfficeIfMissing(),
      ).resolves.toHaveLength(1);

      expect(mockKobisService.getWeeklyBoxOffice).toHaveBeenCalledTimes(2);
      expect(mockRankingRepo.upsert).toHaveBeenCalledWith(expect.any(Array), [
        'source',
        'category',
        'rank',
        'targetDate',
      ]);
      expect(mockRevalidateService.revalidatePath).toHaveBeenCalledWith('/', [
        'rankings',
      ]);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('월요일 00:30과 01:30 수집은 동일한 전주 날짜를 사용해야 한다', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-26T15:30:00.000Z'));
      mockKobisService.getWeeklyBoxOffice.mockRejectedValue(
        new Error('고정 시각 KOBIS 실패'),
      );

      await expect(service.scheduleWeeklyBoxOffice()).resolves.toEqual([]);

      jest.setSystemTime(new Date('2026-07-26T16:30:00.000Z'));
      mockRankingRepo.count.mockResolvedValue(0);

      await expect(service.retryWeeklyBoxOfficeIfMissing()).resolves.toEqual(
        [],
      );

      expect(mockRankingRepo.count).toHaveBeenCalledWith({
        where: {
          source: 'kobis',
          category: 'weekly-box-office',
          targetDate: '2026-07-20',
        },
      });
      expect(mockKobisService.getWeeklyBoxOffice.mock.calls).toEqual([
        ['20260720'],
        ['20260720'],
      ]);
    });
  });
});
