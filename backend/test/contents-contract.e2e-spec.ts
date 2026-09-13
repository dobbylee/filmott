import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AxiosError, AxiosHeaders } from 'axios';
import { Content } from '../src/contents/content.entity';
import { ContentCatalogService } from '../src/contents/services/content-catalog.service';
import { UserRole } from '../src/users/enums/user-role.enum';
import { createContractApp } from './contracts/contract-app';
import { createIntegrationFixtures } from './integration/helpers/fixtures';
import { resetIntegrationDatabase } from './integration/helpers/database';

const movie = {
  id: 101,
  title: '계약 영화',
  original_title: 'Contract Movie',
  overview: '고정 응답의 줄거리',
  release_date: '2026-01-01',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  vote_average: 8.1,
  vote_count: 1000,
  adult: false,
  genres: [{ id: 18, name: 'Drama' }],
  runtime: 120,
  production_countries: [{ iso_3166_1: 'KR' }],
  credits: {
    cast: [{ id: 5, name: '배우', character: '주인공', order: 0 }],
    crew: [{ id: 6, name: '감독', job: 'Director' }],
  },
};

describe('콘텐츠 API 실제 HTTP·외부 응답·DB 계약', () => {
  let harness: Awaited<ReturnType<typeof createContractApp>>;
  let db: DataSource;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let responses: Map<string, unknown>;
  let adminToken: string;

  beforeEach(async () => {
    responses = new Map();
    harness = await createContractApp({
      http: (config) => {
        const key = config.url ?? '';
        if (!responses.has(key)) throw new Error(`미등록 fixture: ${key}`);
        const response = responses.get(key);
        if (response === 'NOT_FOUND')
          throw new AxiosError(
            'fixture 404',
            'ERR_BAD_REQUEST',
            config,
            undefined,
            {
              status: 404,
              statusText: 'Not Found',
              headers: new AxiosHeaders(),
              config,
              data: {},
            },
          );
        if (typeof response === 'function') return response();
        return structuredClone(response);
      },
    });
    db = harness.app.get(DataSource);
    await resetIntegrationDatabase(db);
    fixtures = createIntegrationFixtures(db);
    const admin = await fixtures.user({ role: UserRole.ADMIN });
    adminToken = harness.app.get(JwtService).sign({ sub: admin.id });
  });

  afterEach(async () => {
    if (!harness) return;
    try {
      expect(harness.unexpected).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('전체 검색은 인물1페이지·영화/TV 요청 페이지와 차단 후 count·순서를 보존해야 한다', async () => {
    await fixtures.content({ tmdbId: 1, contentType: 'movie', adult: true });
    for (const type of ['person', 'movie', 'tv'])
      responses.set(`/search/${type}`, {
        page: type === 'person' ? 1 : 2,
        total_pages: 4,
        total_results: 2,
        results: [
          { id: 1, title: `${type}1` },
          { id: 2, title: `${type}2` },
        ],
      });
    const expected = {
      page: 2,
      total_pages: 4,
      total_results: 5,
      personTotal: 2,
      contentTotal: 3,
      results: [
        { id: 1, title: 'person1', media_type: 'person' },
        { id: 2, title: 'person2', media_type: 'person' },
        { id: 2, title: 'movie2', media_type: 'movie' },
        { id: 1, title: 'tv1', media_type: 'tv' },
        { id: 2, title: 'tv2', media_type: 'tv' },
      ],
    };
    for (let run = 0; run < 2; run++) {
      await request(harness.app.getHttpServer())
        .get('/api/contents/search')
        .query({ q: '계약', page: 2 })
        .expect(200, expected);
    }
    expect(
      harness.httpCalls.map((call) => [call.url, call.params.page]),
    ).toEqual([
      ['/search/person', 1],
      ['/search/movie', 2],
      ['/search/tv', 2],
      ['/search/person', 1],
      ['/search/movie', 2],
      ['/search/tv', 2],
    ]);
    expect(harness.httpCalls[0].params).toMatchObject({
      query: '계약',
      language: 'ko-KR',
      region: 'KR',
      include_adult: false,
    });
    expect(await db.getRepository(Content).count()).toBe(1);
    await request(harness.app.getHttpServer())
      .get('/api/contents/search')
      .expect(400);
    await request(harness.app.getHttpServer())
      .get('/api/contents/search?q=x&type=wrong')
      .expect(400);
  });

  it('TV 탐색은 sort/year/provider를 변환하고 차단 작품을 제외해야 한다', async () => {
    await fixtures.content({ tmdbId: 1, contentType: 'tv', adult: true });
    responses.set('/discover/tv', {
      page: 3,
      total_pages: 5,
      total_results: 20,
      results: [{ id: 1 }, { id: 2 }],
    });
    const response = await request(harness.app.getHttpServer())
      .get('/api/contents/discover')
      .query({
        type: 'tv',
        genres: '18',
        providers: '8',
        year: '2020',
        sort: 'primary_release_date.desc',
        page: 3,
      })
      .expect(200);
    expect(response.body).toEqual({
      page: 3,
      total_pages: 5,
      total_results: 19,
      results: [{ id: 2 }],
    });
    expect(harness.httpCalls[0].params).toMatchObject({
      first_air_date_year: 2020,
      sort_by: 'first_air_date.desc',
      with_watch_providers: '8',
      with_genres: '18',
      page: 3,
    });
    await request(harness.app.getHttpServer())
      .get('/api/contents/discover?sort=wrong')
      .expect(400);
  });

  it('상세 miss는 실제 매핑·저장을 거치고 hit는 외부 요청 없이 같은 내용을 반환해야 한다', async () => {
    responses.set('/movie/101', movie);
    const miss = await request(harness.app.getHttpServer())
      .get('/api/contents/movie/101')
      .expect(200);
    expect(miss.body).toMatchObject({
      tmdbId: 101,
      title: '계약 영화',
      originalTitle: 'Contract Movie',
      contentType: 'movie',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      director: '감독',
      originCountry: 'KR',
      genres: [{ id: 18, name: '드라마' }],
      adult: false,
      searchIndexable: true,
      watchProviders: null,
      credits: movie.credits.cast,
    });
    const saved = await db
      .getRepository(Content)
      .findOneByOrFail({ tmdbId: 101, contentType: 'movie' });
    expect(Object.keys(miss.body).sort()).toEqual(
      [
        'id',
        'tmdbId',
        'contentType',
        'title',
        'originalTitle',
        'posterUrl',
        'backdropUrl',
        'overview',
        'releaseDate',
        'voteAverage',
        'voteCount',
        'genres',
        'runtime',
        'director',
        'originCountry',
        'watchProviders',
        'credits',
        'adult',
        'createdAt',
        'updatedAt',
        'searchIndexable',
      ].sort(),
    );
    expect(saved.title).toBe('계약 영화');
    expect(saved.credits).toEqual(movie.credits.cast);
    const firstHit = await request(harness.app.getHttpServer())
      .get('/api/contents/movie/101')
      .expect(200);
    const secondHit = await request(harness.app.getHttpServer())
      .get('/api/contents/movie/101')
      .expect(200);
    expect(firstHit.body).toEqual(secondHit.body);
    expect(firstHit.body).toMatchObject({
      id: saved.id,
      title: '계약 영화',
      searchIndexable: true,
    });
    expect(harness.httpCalls).toHaveLength(1);
    expect(harness.httpCalls[0].params).toEqual({
      language: 'ko-KR',
      append_to_response: 'credits,watch/providers',
    });
  });

  it('존재하지 않는 상세는 negative cache로 같은 404를 반환하고 잘못된 ID는 외부 요청 전에 거부해야 한다', async () => {
    responses.set('/movie/999', 'NOT_FOUND');
    for (let run = 0; run < 2; run++) {
      await request(harness.app.getHttpServer())
        .get('/api/contents/movie/999')
        .expect(404, {
          message: '콘텐츠를 찾을 수 없습니다: movie/999',
          error: 'Not Found',
          statusCode: 404,
        });
    }
    for (const path of [
      'movie/0',
      'movie/20000001',
      'movie/nope',
      'wrong/101',
    ]) {
      await request(harness.app.getHttpServer())
        .get(`/api/contents/${path}`)
        .expect(400);
    }
    expect(harness.httpCalls).toHaveLength(1);
    expect(await db.getRepository(Content).count()).toBe(0);
  });

  it('stale 상세는 즉시 반환하고 중복 갱신 없이 기존 adult 값을 보존해야 한다', async () => {
    const content = await fixtures.content({
      tmdbId: 101,
      adult: true,
      title: '이전 제목',
      updatedAt: new Date('2020-01-01'),
    });
    const releases: Array<(value: unknown) => void> = [];
    // 현재 background 소유자의 실제 promise를 관찰한다. 업무 결과는 대체하지 않는다.
    // 책임 이동 시 이 관찰 경계만 옮기고 HTTP·저장 결과 기대값은 유지한다.
    const background = jest.spyOn(
      harness.app.get<ContentCatalogService>(
        ContentCatalogService,
      ) as unknown as {
        fetchAndSave(
          id: number,
          type: 'movie' | 'tv',
          rememberMissing: boolean,
        ): Promise<unknown>;
      },
      'fetchAndSave',
    );
    responses.set(
      '/movie/101',
      () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    );
    try {
      const first = await request(harness.app.getHttpServer())
        .get('/api/contents/movie/101')
        .timeout({ deadline: 2000 })
        .expect(200);
      const second = await request(harness.app.getHttpServer())
        .get('/api/contents/movie/101')
        .timeout({ deadline: 2000 })
        .expect(200);
      expect(first.body.title).toBe('이전 제목');
      expect(second.body).toEqual(first.body);
      expect(harness.httpCalls).toHaveLength(1);
    } finally {
      releases.forEach((release) => release(movie));
      try {
        const settled = await Promise.allSettled(
          background.mock.results
            .filter((result) => result.type === 'return')
            .map((result) => result.value),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(
          settled.filter((result) => result.status === 'rejected'),
        ).toEqual([]);
      } finally {
        background.mockRestore();
      }
    }
    const saved = await db
      .getRepository(Content)
      .findOneByOrFail({ id: content.id });
    expect(saved).toMatchObject({
      title: movie.title,
      adult: true,
      credits: movie.credits.cast,
      watchProviders: null,
    });
  });

  it('인물 상세·credits는 cache를 재사용하고 미디어/차단/날짜 정렬을 보존해야 한다', async () => {
    const person = {
      id: 5,
      name: '배우',
      biography: '소개',
      birthday: null,
      profile_path: null,
      place_of_birth: null,
      known_for_department: 'Acting',
    };
    responses.set('/person/5', person);
    const newest = { id: 102, media_type: 'tv', first_air_date: '2025-01-01' };
    const older = { id: 101, media_type: 'movie', release_date: '2024-01-01' };
    responses.set('/person/5/combined_credits', {
      cast: [
        older,
        { id: 103, media_type: 'movie' },
        newest,
        { id: 104, media_type: 'person' },
      ],
      crew: [older],
    });
    await fixtures.content({ tmdbId: 103, adult: true });
    for (let run = 0; run < 2; run++) {
      await request(harness.app.getHttpServer())
        .get('/api/contents/person/5')
        .expect(200, person);
      await request(harness.app.getHttpServer())
        .get('/api/contents/person/5/credits')
        .expect(200, { cast: [newest, older], crew: [older] });
    }
    expect(harness.httpCalls).toHaveLength(2);
    responses.set('/person/999', 'NOT_FOUND');
    await request(harness.app.getHttpServer())
      .get('/api/contents/person/999')
      .expect(404);
  });

  it('사이트맵과 세 cohort는 실제 DB 신호·경계·lastModified를 보존해야 한다', async () => {
    const base = {
      posterUrl: '/poster.jpg',
      voteCount: 0,
      updatedAt: new Date('2026-01-03T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const signal = await fixtures.content({ ...base, tmdbId: 101 });
    await fixtures.ranking({ contentId: signal.id });
    const watchProviders = {
      flatrate: [
        { provider_id: 8, provider_name: 'Netflix', logo_path: '/n.png' },
      ],
    };
    await fixtures.content({
      ...base,
      tmdbId: 102,
      voteCount: 2000,
      watchProviders,
    });
    await fixtures.content({
      ...base,
      tmdbId: 103,
      voteCount: 1000,
      watchProviders,
    });
    await fixtures.content({
      ...base,
      tmdbId: 104,
      adult: true,
      voteCount: 9999,
    });
    for (const [cohort, id] of [
      ['filmott-signal', 101],
      ['provider-high', 102],
      ['provider-mid', 103],
    ] as const) {
      await request(harness.app.getHttpServer())
        .get(`/api/contents/sitemap/google/${cohort}`)
        .expect(200, [
          {
            tmdbId: id,
            contentType: 'movie',
            lastModified: '2026-01-03T00:00:00.000Z',
          },
        ]);
    }
    const sitemap = await request(harness.app.getHttpServer())
      .get('/api/contents/sitemap')
      .expect(200);
    expect(sitemap.body.map((row: { tmdbId: number }) => row.tmdbId)).toEqual([
      101, 102, 103,
    ]);
    await request(harness.app.getHttpServer())
      .get('/api/contents/sitemap/google/invalid')
      .expect(400);
  });

  it('성인 관리 API는 권한·저장·차단 cache 무효화·revalidation을 보존해야 한다', async () => {
    const content = await fixtures.content({ tmdbId: 101, adult: false });
    const body = { tmdbId: 101, contentType: 'movie', adult: true };
    responses.set('/search/movie', {
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 101 }],
    });
    const search = () =>
      request(harness.app.getHttpServer()).get(
        '/api/contents/search?q=계약&type=movie',
      );
    expect((await search().expect(200)).body.results).toEqual([
      { id: 101, media_type: 'movie' },
    ]);
    const user = await fixtures.user();
    const userToken = harness.app.get(JwtService).sign({ sub: user.id });
    await request(harness.app.getHttpServer())
      .patch('/api/contents/adult')
      .send(body)
      .expect(401);
    await request(harness.app.getHttpServer())
      .patch('/api/contents/adult')
      .auth(userToken, { type: 'bearer' })
      .send(body)
      .expect(403);
    await request(harness.app.getHttpServer())
      .patch('/api/contents/adult')
      .auth(adminToken, { type: 'bearer' })
      .send(body)
      .expect(200);
    expect(
      (await db.getRepository(Content).findOneByOrFail({ id: content.id }))
        .adult,
    ).toBe(true);
    expect((await search().expect(200)).body.results).toEqual([]);
    const list = await request(harness.app.getHttpServer())
      .get('/api/contents/adult-list?page=0&limit=200')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(list.body.data.map((row: { tmdbId: number }) => row.tmdbId)).toEqual(
      [101],
    );
    expect(
      harness.fetchCalls.map((call) => JSON.parse(String(call.body))),
    ).toEqual([{ path: '/' }, { path: '/contents/movie/101' }]);
    await request(harness.app.getHttpServer())
      .patch('/api/contents/adult')
      .auth(adminToken, { type: 'bearer' })
      .send({ ...body, adult: false })
      .expect(200);
    expect(
      (await db.getRepository(Content).findOneByOrFail({ id: content.id }))
        .adult,
    ).toBe(false);
    expect((await search().expect(200)).body.results).toEqual([
      { id: 101, media_type: 'movie' },
    ]);
  });

  it('인물 일괄 차단은 중복·기차단·개별 실패를 구분해 실제 저장해야 한다', async () => {
    await fixtures.content({ tmdbId: 101, adult: true });
    responses.set('/person/5/combined_credits', {
      cast: [
        { id: 101, media_type: 'movie' },
        { id: 999, media_type: 'movie' },
        { id: 102, media_type: 'movie' },
      ],
      crew: [{ id: 102, media_type: 'movie' }],
    });
    responses.set('/movie/102', { ...movie, id: 102 });
    responses.set('/movie/999', 'NOT_FOUND');
    const response = await request(harness.app.getHttpServer())
      .post('/api/contents/adult/block-person/5')
      .auth(adminToken, { type: 'bearer' })
      .expect(201);
    expect(response.body).toEqual({
      blocked: 1,
      failed: 1,
      total: 3,
      blockedContents: [{ tmdbId: 102, contentType: 'movie' }],
    });
    expect(
      (await db.getRepository(Content).findOneByOrFail({ tmdbId: 102 })).adult,
    ).toBe(true);
    expect(await db.getRepository(Content).count()).toBe(2);
  });

  it.each([
    ['get', '/api/contents/adult-list'],
    ['post', '/api/contents/adult/block-person/5'],
  ] as const)(
    '관리자 전용 %s %s는 익명·일반 사용자를 거부해야 한다',
    async (method, path) => {
      const user = await fixtures.user();
      const token = harness.app.get(JwtService).sign({ sub: user.id });
      await request(harness.app.getHttpServer())[method](path).expect(401);
      await request(harness.app.getHttpServer())
        [method](path)
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(await db.getRepository(Content).count()).toBe(0);
      expect(harness.httpCalls).toEqual([]);
      expect(harness.fetchCalls).toEqual([]);
    },
  );

  it('관련 작품 입력 오류의 메시지와 검증 순서를 DB 조회 없이 보존해야 한다', async () => {
    const runners = jest.spyOn(db, 'createQueryRunner');
    const cases = [
      ['anime/0/related?limit=7', 'type은 "movie" 또는 "tv"만 허용됩니다.'],
      ['movie/0/related?limit=7', '유효하지 않은 TMDB ID입니다.'],
      ['movie/20000001/related', '유효하지 않은 TMDB ID입니다.'],
      ['movie/123/related?limit=0', 'limit은 1에서 6 사이의 정수여야 합니다.'],
      ['movie/123/related?limit=7', 'limit은 1에서 6 사이의 정수여야 합니다.'],
      ['movie/1.5/related', 'Validation failed (numeric string is expected)'],
      [
        'movie/123/related?limit=1.5',
        'Validation failed (numeric string is expected)',
      ],
    ];
    try {
      for (const [path, message] of cases) {
        await request(harness.app.getHttpServer())
          .get(`/api/contents/${path}`)
          .expect(400, { message, error: 'Bad Request', statusCode: 400 });
      }
      expect(runners).not.toHaveBeenCalled();
    } finally {
      runners.mockRestore();
    }
    expect(harness.httpCalls).toEqual([]);
    expect(harness.fetchCalls).toEqual([]);
    expect(harness.s3Spy).not.toHaveBeenCalled();
  });

  it('관련 작품은 실제 SQL로 source·adult를 제외하고 cache와 ID/limit 경계를 보존해야 한다', async () => {
    const base = { posterUrl: '/p.jpg', voteCount: 1000 };
    const source = await fixtures.content({ ...base, tmdbId: 101 });
    await fixtures.content({ ...base, tmdbId: 102, adult: true });
    await fixtures.content({ ...base, tmdbId: 103, title: '관련 작품' });
    const runners = jest.spyOn(db, 'createQueryRunner');
    const first = await request(harness.app.getHttpServer())
      .get('/api/contents/movie/101/related?limit=6')
      .expect(200);
    expect(first.body).toEqual([
      {
        tmdbId: 103,
        contentType: 'movie',
        title: '관련 작품',
        posterUrl: '/p.jpg',
        releaseDate: '2026-01-01',
        voteAverage: 8.1,
      },
    ]);
    const firstQueryRunnerCount = runners.mock.calls.length;
    expect(firstQueryRunnerCount).toBeGreaterThan(0);
    await request(harness.app.getHttpServer())
      .get('/api/contents/movie/101/related')
      .expect(200, first.body);
    expect(runners).toHaveBeenCalledTimes(firstQueryRunnerCount);
    runners.mockRestore();
    for (const path of [
      'movie/101/related?limit=0',
      'movie/101/related?limit=7',
      'movie/0/related',
      'movie/20000001/related',
    ]) {
      await request(harness.app.getHttpServer())
        .get(`/api/contents/${path}`)
        .expect(400);
    }
    expect(harness.httpCalls).toEqual([]);
    expect(harness.fetchCalls).toEqual([]);
    expect(harness.s3Spy).not.toHaveBeenCalled();
  });
});
