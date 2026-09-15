import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Ranking } from '../src/rankings/ranking.entity';
import { Content } from '../src/contents/content.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { createContractApp } from './contracts/contract-app';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

describe('랭킹 API 실제 HTTP·수집·DB 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let adminToken: string;
  let userToken: string;
  let responses: Map<string, unknown>;
  const api = () => request(harness.app.getHttpServer());
  const fixedTime = new Date('2026-09-07T00:00:00Z');

  beforeEach(async () => {
    responses = new Map();
    harness = await createContractApp({
      http: (config) => {
        const path = config.url ?? '';
        if (!responses.has(path)) throw new Error(`미등록 fixture: ${path}`);
        return structuredClone(responses.get(path));
      },
    });
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
    const admin = await fixtures.user({ role: UserRole.ADMIN });
    const user = await fixtures.user();
    adminToken = harness.app.get(JwtService).sign({ sub: admin.id });
    userToken = harness.app.get(JwtService).sign({ sub: user.id });
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (!harness) return;
    try {
      expect(harness.unexpected).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  function freezeDate() {
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
  }

  it('공개 조회는 최신 fetchedAt 묶음의 rank 순서·limit·content join을 보존해야 한다', async () => {
    const content = await fixtures.content();
    await fixtures.ranking({
      rank: 1,
      title: '이전',
      targetDate: '2026-01-01',
      fetchedAt: new Date('2026-01-01'),
    });
    const second = await fixtures.ranking({
      rank: 2,
      title: '둘째',
      targetDate: '2026-01-02',
      fetchedAt: new Date('2026-01-02'),
    });
    const first = await fixtures.ranking({
      rank: 1,
      title: '첫째',
      contentId: content.id,
      targetDate: '2026-01-02',
      fetchedAt: new Date('2026-01-02'),
    });
    await fixtures.ranking({
      source: 'tmdb',
      category: 'trending-all-day',
      rank: 1,
      targetDate: '2026-01-03',
      fetchedAt: new Date('2026-01-03'),
    });
    // targetDate가 더 최신이어도 fetchedAt이 오래된 묶음은 반환하지 않는다.
    await fixtures.ranking({
      rank: 4,
      targetDate: '2026-01-03',
      fetchedAt: new Date('2026-01-01'),
    });
    const url = '/api/rankings?source=kobis&category=daily-box-office';
    const contentFixture = JSON.parse(
      JSON.stringify(
        await db.getRepository(Content).findOneByOrFail({ id: content.id }),
      ),
    );
    const response = await api().get(url).expect(200);
    expect(response.body.map((row: { id: number }) => row.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(response.body[0]).toEqual({
      id: first.id,
      source: 'kobis',
      category: 'daily-box-office',
      targetDate: '2026-01-02',
      fetchedAt: '2026-01-02T00:00:00.000Z',
      contentId: content.id,
      posterUrl: null,
      audienceCount: '1000',
      rank: 1,
      title: '첫째',
      content: contentFixture,
    });
    expect(response.body[1].content).toBeNull();
    const limited = await api().get(`${url}&limit=1`).expect(200);
    expect(limited.body).toEqual([response.body[0]]);
    await api().get(url).expect(200, response.body);
    await api()
      .get('/api/rankings?source=kobis&category=weekly-box-office')
      .expect(200, []);
    for (const query of [
      'source=wrong&category=daily-box-office',
      'source=kobis&category=wrong',
      'source=kobis&category=daily-box-office&limit=nope',
    ]) {
      await api().get(`/api/rankings?${query}`).expect(400);
    }
    expect(harness.httpCalls).toEqual([]);
  });

  it('unmatched는 최신 targetDate의 미매칭 행만 반환하고 poster 변경을 저장·갱신해야 한다', async () => {
    const content = await fixtures.content();
    await fixtures.ranking({ rank: 1, targetDate: '2026-01-01' });
    const missing = await fixtures.ranking({
      rank: 2,
      targetDate: '2026-01-02',
    });
    await fixtures.ranking({
      rank: 1,
      targetDate: '2026-01-02',
      contentId: content.id,
    });
    await fixtures.ranking({
      rank: 1,
      targetDate: '2026-01-03',
      contentId: content.id,
    });
    const response = await api()
      .get('/api/rankings/unmatched')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual([
      JSON.parse(
        JSON.stringify(
          await db.getRepository(Ranking).findOneByOrFail({ id: missing.id }),
        ),
      ),
    ]);
    expect(response.body.map((row: { id: number }) => row.id)).toEqual([
      missing.id,
    ]);
    const posterUrl = 'https://images.contract.local/manual.jpg';
    const patch = await api()
      .patch(`/api/rankings/${missing.id}/poster`)
      .auth(adminToken, { type: 'bearer' })
      .send({ posterUrl })
      .expect(200);
    expect(patch.body).toMatchObject({ id: missing.id, posterUrl });
    expect(
      (await db.getRepository(Ranking).findOneByOrFail({ id: missing.id }))
        .posterUrl,
    ).toBe(posterUrl);
    expect(
      harness.fetchCalls.map((call) => JSON.parse(String(call.body))),
    ).toEqual([{ path: '/', tags: ['rankings'] }]);
    await api()
      .patch('/api/rankings/99999/poster')
      .auth(adminToken, { type: 'bearer' })
      .send({ posterUrl })
      .expect(404);
    await api()
      .patch(`/api/rankings/${missing.id}/poster`)
      .auth(adminToken, { type: 'bearer' })
      .send({ posterUrl: '' })
      .expect(400);
    expect(harness.fetchCalls).toHaveLength(1);
  });

  it('포스터 저장 실패는 DB와 revalidation을 변경하지 않아야 한다', async () => {
    const ranking = await fixtures.ranking({ posterUrl: 'before' });
    const before = await db
      .getRepository(Ranking)
      .findOneByOrFail({ id: ranking.id });
    const save = jest
      .spyOn(db.getRepository(Ranking), 'save')
      .mockRejectedValueOnce(new Error('고정 DB 저장 실패'));
    try {
      await api()
        .patch(`/api/rankings/${ranking.id}/poster`)
        .auth(adminToken, { type: 'bearer' })
        .send({ posterUrl: 'after' })
        .expect(500);
      expect(
        await db.getRepository(Ranking).findOneByOrFail({ id: ranking.id }),
      ).toEqual(before);
      expect(harness.fetchCalls).toEqual([]);
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      save.mockRestore();
    }
  });

  it.each([
    [
      'daily-box-office',
      'dailyBoxOfficeList',
      'searchDailyBoxOfficeList',
      '20260906',
      '2026-09-06',
    ],
    [
      'weekly-box-office',
      'weeklyBoxOfficeList',
      'searchWeeklyBoxOfficeList',
      '20260831',
      '2026-08-31',
    ],
  ])(
    '%s 수동 수집은 고정 날짜와 미매칭 작품을 저장하고 재호출 시 upsert해야 한다',
    async (category, key, endpoint, targetDt, targetDate) => {
      freezeDate();
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
      responses.set(`/boxoffice/${endpoint}.json`, {
        boxOfficeResult: {
          [key]: [officeItem],
        },
      });
      responses.set('/search/movie', {
        page: 1,
        total_pages: 0,
        total_results: 0,
        results: [],
      });
      let originalId: number | undefined;
      for (let run = 0; run < 2; run++) {
        const timestamp = new Date(fixedTime.getTime() + run * 60000);
        jest.setSystemTime(timestamp);
        if (run === 1)
          responses.set(`/boxoffice/${endpoint}.json`, {
            boxOfficeResult: {
              [key]: [{ ...officeItem, movieNm: '갱신 작품', audiAcc: '789' }],
            },
          });
        const result = await api()
          .post(`/api/rankings/refresh/${category}`)
          .auth(adminToken, { type: 'bearer' })
          .expect(201);
        expect(result.body).toHaveLength(1);
        expect(result.body[0]).toMatchObject({
          source: 'kobis',
          category,
          rank: 1,
          title: run === 0 ? '고정 작품' : '갱신 작품',
          targetDate,
          fetchedAt: timestamp.toISOString(),
          audienceCount: run === 0 ? 456 : 789,
        });
        const saved = await db
          .getRepository(Ranking)
          .findOneByOrFail({ category, rank: 1, targetDate });
        if (run === 0) originalId = saved.id;
        expect(saved.id).toBe(originalId);
      }
      const rows = await db.getRepository(Ranking).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        contentId: null,
        targetDate,
        category,
        title: '갱신 작품',
        audienceCount: '789',
        fetchedAt: new Date(fixedTime.getTime() + 60000),
      });
      const kobisCalls = harness.httpCalls.filter((call) =>
        call.url?.startsWith('/boxoffice/'),
      );
      expect(kobisCalls).toHaveLength(2);
      expect(kobisCalls[0].params).toMatchObject({
        targetDt,
        key: 'contract-kobis-key',
      });
      if (category === 'weekly-box-office')
        expect(kobisCalls[0].params.weekGb).toBe('0');
      expect(harness.fetchCalls).toHaveLength(2);
    },
  );

  it.each(['day', 'week'])(
    'trending-all-%s 수동 갱신은 TMDB 결과와 콘텐츠 연결을 저장해야 한다',
    async (period) => {
      freezeDate();
      const content = await fixtures.content({
        tmdbId: 101,
        watchProviders: null,
      });
      responses.set(`/trending/all/${period}`, {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 101,
            media_type: 'movie',
            title: '트렌딩 작품',
            poster_path: '/poster.jpg',
          },
        ],
      });
      const category = `trending-all-${period}`;
      const result = await api()
        .post(`/api/rankings/refresh/${category}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(201);
      expect(result.body).toHaveLength(1);
      expect(result.body[0]).toMatchObject({
        source: 'tmdb',
        category,
        contentId: content.id,
        rank: 1,
        title: '트렌딩 작품',
        targetDate: '2026-09-07',
        fetchedAt: fixedTime.toISOString(),
      });
      expect(await db.getRepository(Ranking).count()).toBe(1);
      const original = await db
        .getRepository(Ranking)
        .findOneByOrFail({ category, rank: 1 });
      const updatedTime = new Date(fixedTime.getTime() + 60000);
      jest.setSystemTime(updatedTime);
      responses.set(`/trending/all/${period}`, {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 101,
            media_type: 'movie',
            title: '갱신 트렌딩',
            poster_path: '/new.jpg',
          },
        ],
      });
      await api()
        .post(`/api/rankings/refresh/${category}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(201);
      expect(await db.getRepository(Ranking).count()).toBe(1);
      expect(
        await db.getRepository(Ranking).findOneByOrFail({ id: original.id }),
      ).toMatchObject({
        title: '갱신 트렌딩',
        posterUrl: 'https://image.tmdb.org/t/p/w500/new.jpg',
        fetchedAt: updatedTime,
        contentId: content.id,
      });
      expect(harness.httpCalls).toHaveLength(2);
      expect(harness.httpCalls[0].params).toEqual({
        language: 'ko-KR',
        include_adult: false,
      });
      expect(
        harness.fetchCalls.map((call) => JSON.parse(String(call.body))),
      ).toEqual([
        { path: '/', tags: ['rankings'] },
        { path: '/', tags: ['rankings'] },
      ]);
    },
  );

  it.each([
    ['get', '/api/rankings/unmatched'],
    ['patch', '/api/rankings/1/poster'],
    ['post', '/api/rankings/refresh/daily-box-office'],
  ] as const)(
    '관리자 전용 %s %s는 익명·일반 사용자에게 부수 효과 없이 거부해야 한다',
    async (method, url) => {
      await api()[method](url).send({ posterUrl: 'manual' }).expect(401);
      await api()
        [method](url)
        .auth(userToken, { type: 'bearer' })
        .send({ posterUrl: 'manual' })
        .expect(403);
      expect(await db.getRepository(Ranking).count()).toBe(0);
      expect(harness.httpCalls).toEqual([]);
      expect(harness.fetchCalls).toEqual([]);
    },
  );

  it('잘못된 수집 category와 외부 응답 오류는 저장이나 성공 응답으로 바꾸지 않아야 한다', async () => {
    await api()
      .post('/api/rankings/refresh/unknown')
      .auth(adminToken, { type: 'bearer' })
      .expect(400);
    responses.set('/boxoffice/searchDailyBoxOfficeList.json', {
      boxOfficeResult: { dailyBoxOfficeList: 'invalid' },
    });
    await api()
      .post('/api/rankings/refresh/daily-box-office')
      .auth(adminToken, { type: 'bearer' })
      .expect(502);
    expect(await db.getRepository(Ranking).count()).toBe(0);
    expect(harness.fetchCalls).toEqual([]);
  });
});
