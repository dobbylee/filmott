import * as Sentry from '@sentry/nestjs';
import { ModulesContainer } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { RankingsSchedulerService } from '../src/rankings/services/rankings-scheduler.service';
import { RankingsSyncService } from '../src/rankings/services/rankings-sync.service';
import { Ranking } from '../src/rankings/ranking.entity';
import { Content } from '../src/contents/content.entity';
import { ContentMetadata } from '../src/recommendation/content-metadata.entity';
import { ContentMetadataService } from '../src/recommendation/content-metadata.service';
import { UserRole } from '../src/users/enums/user-role.enum';
import { createContractApp } from './contracts/contract-app';
import {
  completionResponse,
  embeddingResponse,
} from './contracts/openai-fixtures';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

jest.mock('@sentry/nestjs', () => ({
  ...jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs'),
  captureException: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const fixedTime = new Date('2026-09-07T00:00:00Z');
const officeItem = {
  rank: '1',
  movieNm: '고정 작품',
  movieCd: '111',
  openDt: '2026-01-01',
  audiCnt: '123',
  audiAcc: '456',
  salesAmt: '1000',
  salesAcc: '2000',
};
const targetDates = { daily: '2026-09-06', weekly: '2026-08-31' };
const flatrate = {
  flatrate: [
    { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' },
  ],
};
const detail = (id: number, type: 'movie' | 'tv' = 'movie') => ({
  id,
  title: '고정 작품',
  name: '고정 작품',
  original_title: 'Fixed Movie',
  original_name: 'Fixed TV',
  release_date: '2026-01-01',
  first_air_date: '2026-01-01',
  overview: '고정 줄거리',
  poster_path: '/poster.jpg',
  vote_average: 8,
  vote_count: 100,
  adult: false,
  genres: [{ id: 18, name: 'Drama' }],
  production_countries: [{ iso_3166_1: 'KR' }],
  origin_country: ['KR'],
  credits: { cast: [], crew: [] },
  'watch/providers': { results: { KR: flatrate } },
  media_type: type,
});

describe('랭킹 예약→수집 실제 업무·DB 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let scheduler: RankingsSchedulerService;
  let responses: Map<string, unknown>;
  let sdkCalls: { path: string; body: Record<string, unknown> }[];
  let descriptionResponse: () => Promise<Response>;
  let blocked: ReturnType<typeof deferred<Response>> | undefined;
  let foregrounds: Promise<unknown>[];
  let batch: jest.SpyInstance;

  beforeEach(async () => {
    responses = new Map();
    sdkCalls = [];
    blocked = undefined;
    foregrounds = [];
    descriptionResponse = async () =>
      completionResponse('고정 랭킹 metadata 설명');
    jest.mocked(Sentry.captureException).mockClear();
    harness = await createContractApp({
      openaiKey: 'contract-key',
      http: (config) => {
        const path =
          config.url === '/discover/tv'
            ? `/discover/tv?page=${Number(config.params?.page)}`
            : (config.url ?? '');
        if (!responses.has(path)) throw new Error(`미등록 fixture: ${path}`);
        const value = responses.get(path);
        if (value instanceof Error) throw value;
        return structuredClone(value);
      },
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.startsWith('https://api.openai.com/v1/'))
          throw new Error(`미등록 fixture: ${url}`);
        if (typeof init?.body !== 'string')
          throw new Error('SDK JSON body 없음');
        const body: unknown = JSON.parse(init.body);
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new Error('SDK body 형식 오류');
        const call = {
          path: new URL(url).pathname,
          body: body as Record<string, unknown>,
        };
        sdkCalls.push(call);
        if (call.path === '/v1/embeddings')
          return embeddingResponse(call.body.encoding_format);
        if (
          call.path === '/v1/chat/completions' &&
          call.body.max_completion_tokens === 2048
        )
          return descriptionResponse();
        throw new Error(`미등록 SDK fixture: ${call.path}`);
      },
    });
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
    scheduler = harness.app.get(RankingsSchedulerService);
    batch = jest.spyOn(
      harness.app.get(ContentMetadataService),
      'batchCacheByContentIds',
    );
    jest.useFakeTimers({
      now: fixedTime,
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'hrtime',
        'performance',
        'queueMicrotask',
      ],
    });
  });

  async function settleBackground() {
    const results = await Promise.allSettled(
      batch.mock.results
        .filter((result) => result.type === 'return')
        .map((result) => result.value),
    );
    expect(results.filter((result) => result.status === 'rejected')).toEqual(
      [],
    );
  }
  afterEach(async () => {
    if (!harness) return;
    try {
      blocked?.resolve(completionResponse('정리용 설명'));
      await Promise.allSettled(foregrounds);
      await settleBackground();
      expect(harness.unexpected).toEqual([]);
    } finally {
      batch.mockRestore();
      jest.useRealTimers();
      await harness.close();
    }
  });
  const revalidations = () =>
    harness.fetchCalls.filter((call) =>
      call.url.endsWith('/internal/revalidate'),
    );
  function allowOffice(kind: 'daily' | 'weekly', matched = false) {
    responses.set(
      `/boxoffice/search${kind === 'daily' ? 'Daily' : 'Weekly'}BoxOfficeList.json`,
      {
        boxOfficeResult: {
          [kind === 'daily' ? 'dailyBoxOfficeList' : 'weeklyBoxOfficeList']: [
            officeItem,
          ],
        },
      },
    );
    responses.set('/search/movie', {
      page: 1,
      total_pages: 1,
      total_results: matched ? 2 : 0,
      results: matched
        ? [
            { id: 999, title: '다른 작품', release_date: '2026-01-01' },
            { id: 101, title: '고정 작품', release_date: '2026-01-01' },
          ]
        : [],
    });
    if (matched) responses.set('/movie/101', detail(101));
  }

  it('실제 scheduler와 sync는 단일 provider와 metadata instance를 공유해야 한다', () => {
    const modules = harness.app.get(ModulesContainer);
    for (const token of [RankingsSchedulerService, RankingsSyncService]) {
      const registered = [...modules.values()].flatMap((module) =>
        [...module.providers.values()].filter(
          (provider) => provider.token === token,
        ),
      );
      expect(registered).toHaveLength(1);
      expect(registered[0].instance).toBe(harness.app.get(token));
    }
    const sync = harness.app.get(RankingsSyncService);
    expect(Reflect.get(scheduler, 'syncService')).toBe(sync);
    expect(Reflect.get(sync, 'metadataService')).toBe(
      harness.app.get(ContentMetadataService),
    );
  });

  it.each([
    ['daily', 0],
    ['daily', 9],
    ['daily', 10],
    ['weekly', 0],
    ['weekly', 9],
    ['weekly', 10],
  ] as const)(
    '%s 실제 count=%i는 조건에 맞는 날짜와 종류만 세어 skip 또는 수집해야 한다',
    async (kind, count) => {
      const category = `${kind}-box-office`;
      for (let rank = 1; rank <= count; rank++)
        await fixtures.ranking({
          source: 'kobis',
          category,
          rank,
          targetDate: targetDates[kind],
          fetchedAt: new Date('2026-09-01'),
        });
      for (let rank = 1; rank <= 10; rank++) {
        await fixtures.ranking({
          source: 'kobis',
          category,
          rank,
          targetDate: '2020-01-01',
        });
        await fixtures.ranking({
          source: 'tmdb',
          category,
          rank,
          targetDate: targetDates[kind],
        });
      }
      allowOffice(kind);
      const result =
        kind === 'daily'
          ? await scheduler.retryDailyBoxOfficeIfMissing()
          : await scheduler.retryWeeklyBoxOfficeIfMissing();
      if (count === 10) {
        expect(result).toBeUndefined();
        expect(harness.httpCalls).toEqual([]);
        expect(revalidations()).toEqual([]);
      } else {
        expect(result).toHaveLength(1);
        expect(harness.httpCalls.map((call) => call.url)).toEqual([
          `/boxoffice/search${kind === 'daily' ? 'Daily' : 'Weekly'}BoxOfficeList.json`,
          '/search/movie',
        ]);
        expect(harness.httpCalls[0].params.targetDt).toBe(
          targetDates[kind].replaceAll('-', ''),
        );
        expect(
          await db.getRepository(Ranking).findOneByOrFail({
            source: 'kobis',
            category,
            targetDate: targetDates[kind],
            rank: 1,
          }),
        ).toMatchObject({
          fetchedAt: fixedTime,
          title: '고정 작품',
          contentId: null,
        });
        expect(revalidations()).toHaveLength(1);
      }
      expect(
        await db.getRepository(Ranking).countBy({
          source: 'kobis',
          category,
          targetDate: targetDates[kind],
        }),
      ).toBe(Math.max(count, 1));
    },
  );

  it.each(['daily', 'weekly'] as const)(
    '%s count DB 실패의 전파/보고 차이를 유지해야 한다',
    async (kind) => {
      const error = new Error('고정 count 실패');
      const count = jest
        .spyOn(db.getRepository(Ranking), 'count')
        .mockRejectedValueOnce(error);
      try {
        if (kind === 'daily') {
          await expect(scheduler.retryDailyBoxOfficeIfMissing()).rejects.toBe(
            error,
          );
          expect(Sentry.captureException).not.toHaveBeenCalled();
        } else {
          await expect(
            scheduler.retryWeeklyBoxOfficeIfMissing(),
          ).resolves.toEqual([]);
          expect(Sentry.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              service: 'DATABASE',
              operation: 'weekly-box-office-completeness-check',
            }),
          );
        }
        expect(harness.httpCalls).toEqual([]);
        expect(revalidations()).toEqual([]);
      } finally {
        count.mockRestore();
      }
    },
  );

  it.each([
    ['scheduleDailyBoxOfficeMidnight', 'daily', 0],
    ['retryDailyBoxOfficeIfMissing', 'daily', 0],
    ['scheduleDailyBoxOfficeStabilization', 'daily', 1],
    ['scheduleDailyBoxOfficeNoon', 'daily', 1],
    ['scheduleWeeklyBoxOffice', 'weekly', 0],
    ['retryWeeklyBoxOfficeIfMissing', 'weekly', 1],
  ] as const)(
    '%s 외부 실패의 warn/report 정책을 보존해야 한다',
    async (method, kind, reports) => {
      responses.set(
        `/boxoffice/search${kind === 'daily' ? 'Daily' : 'Weekly'}BoxOfficeList.json`,
        new Error('고정 KOBIS 실패'),
      );
      await expect(scheduler[method]()).resolves.toEqual([]);
      expect(Sentry.captureException).toHaveBeenCalledTimes(reports);
      expect(await db.getRepository(Ranking).count()).toBe(0);
      expect(revalidations()).toEqual([]);
      expect(batch).not.toHaveBeenCalled();
      expect(harness.httpCalls).toHaveLength(1);
    },
  );

  it.each(['daily', 'weekly'] as const)(
    '%s 수동 실패는 실제 HTTP502와 보고를 유지해야 한다',
    async (kind) => {
      const admin = await fixtures.user({ role: UserRole.ADMIN });
      const token = harness.app.get(JwtService).sign({ sub: admin.id });
      responses.set(
        `/boxoffice/search${kind === 'daily' ? 'Daily' : 'Weekly'}BoxOfficeList.json`,
        new Error('고정 KOBIS 실패'),
      );
      const response = await request(harness.app.getHttpServer())
        .post(`/api/rankings/refresh/${kind}-box-office`)
        .auth(token, { type: 'bearer' })
        .expect(502);
      expect(response.body.message).toBe(
        `KOBIS ${kind === 'daily' ? '일별' : '주간'} 박스오피스 조회에 실패했습니다.`,
      );
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(await db.getRepository(Ranking).count()).toBe(0);
      expect(revalidations()).toEqual([]);
    },
  );

  it.each(['daily', 'weekly'] as const)(
    '%s 실제 matching·catalog·ranking·metadata 저장을 연결해야 한다',
    async (kind) => {
      allowOffice(kind, true);
      for (let rank = 1; rank <= 10; rank++) {
        await fixtures.ranking({
          source: 'kobis',
          category: `${kind}-box-office`,
          rank,
          targetDate: targetDates[kind],
          fetchedAt: new Date('2026-08-01'),
        });
      }
      const result =
        kind === 'daily'
          ? await scheduler.scheduleDailyBoxOfficeStabilization()
          : await scheduler.scheduleWeeklyBoxOffice();
      await settleBackground();
      const content = await db
        .getRepository(Content)
        .findOneByOrFail({ tmdbId: 101, contentType: 'movie' });
      expect(await db.getRepository(Content).countBy({ tmdbId: 999 })).toBe(0);
      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBe(content.id);
      expect(
        await db
          .getRepository(Ranking)
          .findOneByOrFail({ category: `${kind}-box-office`, rank: 1 }),
      ).toMatchObject({ contentId: content.id, targetDate: targetDates[kind] });
      expect(
        await db
          .getRepository(ContentMetadata)
          .findOneByOrFail({ contentId: content.id }),
      ).toMatchObject({ description: '고정 랭킹 metadata 설명' });
      expect(harness.httpCalls.map((call) => call.url)).toEqual([
        `/boxoffice/search${kind === 'daily' ? 'Daily' : 'Weekly'}BoxOfficeList.json`,
        '/search/movie',
        '/movie/101',
      ]);
      expect(sdkCalls.map((call) => call.path)).toEqual([
        '/v1/chat/completions',
        '/v1/embeddings',
      ]);
      expect(revalidations()).toHaveLength(1);
    },
  );

  it('trending day 실패 뒤 week를 수집하고 flatrate 후보만 metadata 저장하며 한 번 갱신해야 한다', async () => {
    const available = await fixtures.content({
      tmdbId: 101,
      watchProviders: flatrate,
    });
    const unavailable = await fixtures.content({
      tmdbId: 102,
      watchProviders: null,
    });
    responses.set('/trending/all/day', new Error('day 실패'));
    responses.set('/trending/all/week', {
      page: 1,
      total_pages: 1,
      total_results: 2,
      results: [
        { id: 101, media_type: 'movie', title: '구독 작품' },
        { id: 102, media_type: 'movie', title: '미제공 작품' },
      ],
    });
    await scheduler.fetchAllTrending();
    await settleBackground();
    expect(harness.httpCalls.map((call) => call.url)).toEqual([
      '/trending/all/day',
      '/trending/all/week',
    ]);
    expect(await db.getRepository(Ranking).count()).toBe(2);
    expect(
      await db
        .getRepository(ContentMetadata)
        .countBy({ contentId: available.id }),
    ).toBe(1);
    expect(
      await db
        .getRepository(ContentMetadata)
        .countBy({ contentId: unavailable.id }),
    ).toBe(0);
    expect(batch).toHaveBeenCalledWith([available.id]);
    expect(revalidations()).toHaveLength(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('Discover 두 페이지의 부분 상세 실패를 허용하고 rankings와 revalidation은 변경하지 않아야 한다', async () => {
    const saved = await fixtures.ranking({});
    const before = await db
      .getRepository(Ranking)
      .findOneByOrFail({ id: saved.id });
    responses.set('/discover/tv?page=1', {
      page: 1,
      total_pages: 2,
      total_results: 2,
      results: [{ id: 101 }],
    });
    responses.set('/discover/tv?page=2', {
      page: 2,
      total_pages: 2,
      total_results: 2,
      results: [{ id: 102 }],
    });
    responses.set('/tv/101', detail(101, 'tv'));
    responses.set('/tv/102', new Error('부분 상세 실패'));
    await scheduler.fetchKoreanTvDiscover();
    await settleBackground();
    const calls = harness.httpCalls.filter(
      (call) => call.url === '/discover/tv',
    );
    expect(calls.map((call) => call.params.page)).toEqual([1, 2]);
    expect(calls[0].params).toMatchObject({
      with_origin_country: 'KR',
      sort_by: 'first_air_date.desc',
      'first_air_date.gte': '2026-03-07',
      'first_air_date.lte': '2026-09-07',
    });
    expect(await db.getRepository(Ranking).find()).toEqual([before]);
    expect(await db.getRepository(Content).countBy({ tmdbId: 102 })).toBe(0);
    const content = await db
      .getRepository(Content)
      .findOneByOrFail({ tmdbId: 101, contentType: 'tv' });
    expect(
      await db
        .getRepository(ContentMetadata)
        .countBy({ contentId: content.id }),
    ).toBe(1);
    expect(revalidations()).toEqual([]);
  });

  it.each([false, true])(
    'metadata background 완료를 기다리지 않고 수집이 반환되어야 한다 (실패=%s)',
    async (fail) => {
      allowOffice('daily', true);
      blocked = deferred<Response>();
      const started = deferred<void>();
      descriptionResponse = () => {
        started.resolve(undefined);
        return blocked!.promise;
      };
      let finished = false;
      const foreground = scheduler
        .scheduleDailyBoxOfficeMidnight()
        .then((result) => {
          finished = true;
          return result;
        });
      foregrounds.push(foreground);
      try {
        await started.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(finished).toBe(true);
        expect(revalidations()).toHaveLength(1);
        expect(await db.getRepository(ContentMetadata).count()).toBe(0);
      } finally {
        blocked.resolve(
          fail
            ? Response.json(
                {
                  error: {
                    message: '고정 metadata 실패',
                    type: 'invalid_request_error',
                  },
                },
                { status: 400 },
              )
            : completionResponse('고정 랭킹 metadata 설명'),
        );
        await foreground;
        await settleBackground();
      }
      expect(await db.getRepository(Ranking).count()).toBe(1);
      expect(await db.getRepository(ContentMetadata).count()).toBe(
        fail ? 0 : 1,
      );
      expect(sdkCalls.map((call) => call.path)).toEqual(
        fail
          ? ['/v1/chat/completions']
          : ['/v1/chat/completions', '/v1/embeddings'],
      );
    },
  );
});
