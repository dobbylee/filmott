// 부하 생성기는 별도 부모 프로세스다. 이 worker에는 앱과 측정용 외부 fixture만 둔다.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { install } = require('@sinonjs/fake-timers');
require('reflect-metadata');
const clock = install({
  now: new Date('2026-01-02T00:00:00Z'),
  toFake: ['Date'],
});
const axios = require('axios').default;
const { AxiosHeaders } = require('axios');
const { S3Client } = require('@aws-sdk/client-s3');
const { ConfigModule, ConfigService } = require('@nestjs/config');
const { Test } = require('@nestjs/testing');
const { DiscoveryService } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { DataSource } = require('typeorm');
const { scenarios } = require('./metrics.cjs');
const { relatedVector } = require('./fixtures.cjs');
const {
  completionResponse,
  embeddingResponse,
  streamFrame,
} = require('../contracts/openai-fixtures.ts');
const sourceRoot = path.resolve(process.env.FILMOTT_BENCHMARK_SOURCE_ROOT);
assert.equal(
  fs.realpathSync(path.join(sourceRoot, 'node_modules')),
  fs.realpathSync(path.resolve(__dirname, '../../node_modules')),
  'source dependency realpath가 harness와 다릅니다.',
);
const originalForRoot = ConfigModule.forRoot.bind(ConfigModule);
ConfigModule.forRoot = (options) =>
  originalForRoot({ ...options, ignoreEnvFile: true });
const { AppModule } = require(path.join(sourceRoot, 'src/app.module.ts'));
const { configureApp } = require(path.join(sourceRoot, 'src/configure-app.ts'));
ConfigModule.forRoot = originalForRoot;

let app;
let db;
let scenario;
let dataSize;
let totalRequests;
let sampledRssMax = 0;
let sampleTimer;
let cpuStart;
let counts;
const pending = new Set();
const backgroundFailures = [];
let failureInjections = 0;
let measuring = false;

function resetCounts() {
  counts = {
    dbCalls: 0,
    externalCalls: 0,
    completed: 0,
    httpErrors: 0,
    unexpected: [],
  };
}
resetCounts();

function track(promise) {
  pending.add(promise);
  promise.then(
    () => pending.delete(promise),
    (error) => {
      pending.delete(promise);
      backgroundFailures.push(String(error));
    },
  );
  return promise;
}

async function drain() {
  do {
    await Promise.allSettled([...pending]);
    await new Promise((resolve) => setImmediate(resolve));
  } while (pending.size);
  assert.deepEqual(backgroundFailures, [], 'background가 실패했습니다.');
}

async function closeApp() {
  clearInterval(sampleTimer);
  if (!app) return;
  const closing = app;
  app = undefined;
  try {
    await drain();
  } finally {
    await closing.close();
  }
  if (process.env.FILMOTT_BENCHMARK_FAILURE === 'close')
    throw new Error('고정 worker 정리 실패');
}

function externalFailure(message) {
  counts.unexpected.push(message);
  throw new Error(message);
}

axios.defaults.adapter = async (config) => {
  counts.externalCalls++;
  const url = config.url ?? '';
  let data;
  if (/^\/movie\/\d+$/.test(url)) {
    const id = Number(url.split('/').at(-1));
    data = {
      id,
      title: `외부 작품 ${id}`,
      original_title: `External ${id}`,
      overview: '고정 외부 응답 줄거리',
      poster_path: '/poster.jpg',
      release_date: '2025-01-01',
      vote_average: 8.1,
      vote_count: 1000,
      adult: false,
      genres: [{ id: 18, name: 'Drama' }],
      runtime: 120,
      origin_country: ['KR'],
      credits: { cast: [], crew: [] },
    };
  } else if (/^\/person\/\d+$/.test(url)) {
    data = {
      id: Number(url.split('/').at(-1)),
      name: '벤치마크 인물',
      profile_path: null,
      biography: '고정 소개',
      birthday: null,
      place_of_birth: null,
      known_for_department: 'Acting',
    };
  } else if (url === '/boxoffice/searchDailyBoxOfficeList.json') {
    data = {
      boxOfficeResult: {
        dailyBoxOfficeList: [
          {
            rank: '1',
            movieNm: '외부 랭킹',
            movieCd: '123',
            openDt: '2025-01-01',
            audiCnt: '100',
            audiAcc: '1000',
            salesAmt: '1000',
            salesAcc: '10000',
          },
        ],
      },
    };
  } else if (url === '/search/movie')
    data = { page: 1, total_pages: 0, total_results: 0, results: [] };
  else return externalFailure(`미등록 Axios fixture: ${url}`);
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  };
};

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  counts.externalCalls++;
  if (url === 'http://benchmark.filmott.local/internal/revalidate')
    return Response.json({});
  if (!url.startsWith('https://api.openai.com/v1/'))
    return externalFailure(`미등록 fetch fixture: ${url}`);
  assert.equal(typeof init?.body, 'string');
  const body = JSON.parse(init.body);
  if (url.endsWith('/embeddings')) {
    if (scenario === 'chat-fallback')
      return Response.json(
        {
          error: {
            message: '고정 embedding 실패',
            type: 'invalid_request_error',
          },
        },
        { status: 400 },
      );
    return embeddingResponse(body.encoding_format);
  }
  if (!url.endsWith('/chat/completions'))
    return externalFailure(`미등록 OpenAI fixture: ${url}`);
  if (!body.stream)
    return completionResponse(
      JSON.stringify({
        ottProviderNames: [],
        countries: [],
        excludeCountries: [],
        personNames: [],
        referenceTitles: [],
        dateRange: null,
        contentType: 'movie',
        genres: ['드라마'],
        confidence: 'high',
      }),
    );
  const text = JSON.stringify({
    recommendations: [
      { tmdbId: 100, contentType: 'movie', reason: '고정 추천 이유' },
    ],
    message: '',
    followUpQuestion: '',
  });
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamFrame(text)));
        const timer = setTimeout(() => {
          controller.enqueue(
            new TextEncoder().encode(
              streamFrame(null, 'stop') + 'data: [DONE]\n\n',
            ),
          );
          controller.close();
        }, 5);
        init.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            try {
              controller.error(
                new DOMException('fixture aborted', 'AbortError'),
              );
            } catch {
              /* 이미 종료됨 */
            }
          },
          { once: true },
        );
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
};
S3Client.prototype.send = async () =>
  externalFailure('벤치마크에 없는 R2 요청');

function configuration() {
  assert.equal(
    process.env.TEST_DB_NAME,
    'filmott_benchmark_test',
    '러너 소유 benchmark DB만 사용합니다.',
  );
  return new ConfigService({
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: Number(process.env.TEST_DB_PORT),
    DB_USERNAME: process.env.TEST_DB_USERNAME,
    DB_PASSWORD: process.env.TEST_DB_PASSWORD,
    DB_NAME: process.env.TEST_DB_NAME,
    JWT_SECRET: 'benchmark-jwt-secret',
    FRONTEND_URL: 'http://benchmark.filmott.local',
    FRONTEND_INTERNAL_URL: 'http://benchmark.filmott.local',
    CORS_ORIGIN: 'http://benchmark.filmott.local',
    REVALIDATE_SECRET: 'benchmark-revalidate',
    OPENAI_API_KEY: 'benchmark-openai-key',
    TMDB_API_KEY: 'benchmark-tmdb',
    KOBIS_API_KEY: 'benchmark-kobis',
    R2_ACCOUNT_ID: 'benchmark',
    R2_BUCKET_NAME: 'benchmark',
    R2_PUBLIC_URL: 'https://images.benchmark.local',
    R2_ACCESS_KEY_ID: 'benchmark',
    R2_SECRET_ACCESS_KEY: 'benchmark',
    ...Object.fromEntries(
      ['GOOGLE', 'KAKAO', 'NAVER'].flatMap((provider) => [
        [`${provider}_CLIENT_ID`, 'benchmark'],
        [`${provider}_CLIENT_SECRET`, 'benchmark'],
        [
          `${provider}_CALLBACK_URL`,
          `http://benchmark.filmott.local/api/auth/${provider.toLowerCase()}/callback`,
        ],
      ]),
    ),
  });
}

function observeBackground() {
  const providers = app
    .get(DiscoveryService)
    .getProviders()
    .filter((wrapper) => !wrapper.isAlias)
    .map((wrapper) => wrapper.instance)
    .filter((instance) => instance && typeof instance === 'object');
  for (const name of ['fetchAndSave', 'batchCacheByContentIds']) {
    const owners = [
      ...new Set(
        providers.filter((instance) => typeof instance[name] === 'function'),
      ),
    ];
    assert.equal(
      owners.length,
      1,
      `${name}의 실제 background 관찰 경계를 확인해야 합니다.`,
    );
    const owner = owners[0];
    const original = owner[name];
    owner[name] = (...args) =>
      track(Promise.resolve(Reflect.apply(original, owner, args)));
  }
  if (scenario === 'review-rollback') {
    const owners = providers.filter(
      (instance) =>
        typeof instance.addToWatchlistByContentIdWithManager === 'function',
    );
    assert.equal(owners.length, 1);
    owners[0].addToWatchlistByContentIdWithManager = async () => {
      failureInjections++;
      throw new Error('고정 후속 저장 실패');
    };
  }
}

async function prepare(options) {
  await closeApp();
  assert(scenarios.includes(options.scenario));
  scenario = options.scenario;
  dataSize = options.dataset;
  totalRequests = options.totalRequests;
  assert(
    Number.isInteger(dataSize) && dataSize >= totalRequests && dataSize <= 5000,
  );
  backgroundFailures.length = 0;
  failureInjections = 0;
  cpuStart = undefined;
  measuring = false;
  resetCounts();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue(configuration())
    .compile();
  app = module.createNestApplication({ logger: false });
  configureApp(app);
  app.use((_req, res, next) => {
    res.once('finish', () => {
      counts.completed++;
      if (res.statusCode >= 400) counts.httpErrors++;
    });
    if (
      measuring &&
      process.env.FILMOTT_BENCHMARK_FAILURE === 'sample' &&
      counts.completed === 1
    ) {
      res.status(500).json({ message: '고정 측정 실패' });
      return;
    }
    next();
  });
  await app.init();
  db = app.get(DataSource);
  assert.equal(db.options.database, 'filmott_benchmark_test');
  // 모든 관련 테스트 테이블을 함께 초기화하므로 CASCADE가 필요 없다. 운영 스키마는 바꾸지 않는다.
  const tables = [
    ...new Set(
      db.entityMetadatas.map((entry) =>
        [entry.schema, entry.tableName]
          .filter(Boolean)
          .map((part) => db.driver.escape(part))
          .join('.'),
      ),
    ),
  ];
  await db.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY`);
  const userCount = scenario.startsWith('chat') ? totalRequests : 1;
  await db.getRepository('User').insert(
    Array.from({ length: userCount }, (_, index) => ({
      nickname: `benchmark_user_${index}`,
      email: `benchmark${index}@example.com`,
      password: null,
      provider: 'LOCAL',
      status: 'ACTIVE',
      role: scenario.startsWith('chat') ? 'USER' : 'ADMIN',
      subscribedOtts: [],
      createdAt: new Date('2025-01-01'),
    })),
  );
  const contents = Array.from({ length: dataSize }, (_, index) => ({
    tmdbId: 100 + index,
    contentType: 'movie',
    title: index === 0 ? '벤치마크 대표 작품' : `벤치마크 작품 ${index}`,
    originalTitle: `Benchmark ${index}`,
    posterUrl: '/poster.jpg',
    backdropUrl: '/backdrop.jpg',
    overview: '고정 벤치마크 줄거리',
    releaseDate: new Date('2025-01-01'),
    voteAverage: 8.1,
    voteCount: 1000000 - index * 100,
    genres:
      scenario.startsWith('chat') && index >= 5
        ? [{ id: 28, name: '액션' }]
        : [{ id: 18, name: '드라마' }],
    runtime: 120,
    director: '벤치마크 감독',
    originCountry: 'KR',
    watchProviders: null,
    credits: [],
    adult: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date(
      scenario === 'detail-stale' ? '2020-01-01' : '2026-01-02',
    ),
  }));
  await db.getRepository('Content').insert(contents);
  if (scenario.startsWith('related') || scenario.startsWith('chat')) {
    const metadata = contents.map((_, index) => {
      const vector = scenario.startsWith('related')
        ? relatedVector(index, dataSize)
        : Array.from({ length: 1536 }, () => 0.01);
      return {
        contentId: index + 1,
        description: '고정 metadata 설명',
        embedding: `[${vector.join(',')}]`,
      };
    });
    await db.getRepository('ContentMetadata').insert(metadata);
  }
  if (scenario === 'rankings-read')
    await db.getRepository('Ranking').insert(
      Array.from({ length: 10 }, (_, index) => ({
        source: 'kobis',
        category: 'daily-box-office',
        rank: index + 1,
        targetDate: '2026-01-01',
        title: `랭킹 ${index}`,
        contentId: index + 1,
        audienceCount: 1000,
        fetchedAt: new Date('2026-01-02'),
      })),
    );
  // 동일 데이터라도 planner 통계가 달라지지 않도록 준비 단계에서 분석한다. 측정에서는 제외한다.
  await db.query('ANALYZE');
  const version = await db.query('SELECT version() AS version');
  const extension = await db.query(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
  );
  const originalLog = db.logger.logQuery.bind(db.logger);
  db.logger.logQuery = (...args) => {
    counts.dbCalls++;
    originalLog(...args);
  };
  observeBackground();
  await app.listen(0, '127.0.0.1');
  if (process.env.FILMOTT_BENCHMARK_FAILURE === 'prepare')
    throw new Error('고정 worker 준비 실패');
  return {
    url: await app.getUrl(),
    tokens: Array.from({ length: userCount }, (_, index) =>
      app.get(JwtService).sign({ sub: index + 1 }),
    ),
    postgres: version[0].version,
    pgvector: extension[0].extversion,
    pool: db.options.extra,
    clock: new Date().toISOString(),
    dataSize,
  };
}

async function dispatch(message) {
  switch (message.type) {
    case 'prepare':
      return prepare(message.options);
    case 'drain':
      await drain();
      return null;
    case 'begin':
      await drain();
      global.gc?.();
      failureInjections = 0;
      resetCounts();
      sampledRssMax = process.memoryUsage().rss;
      sampleTimer = setInterval(() => {
        sampledRssMax = Math.max(sampledRssMax, process.memoryUsage().rss);
      }, 25);
      cpuStart = process.cpuUsage();
      measuring = true;
      return null;
    case 'snapshot':
      return {
        ...counts,
        partial: true,
        pending: pending.size,
        cpu: cpuStart ? process.cpuUsage(cpuStart) : null,
        rss: process.memoryUsage().rss,
        backgroundFailures: [...backgroundFailures],
      };
    case 'end': {
      await drain();
      clearInterval(sampleTimer);
      const rssEnd = process.memoryUsage().rss;
      const result = {
        ...counts,
        cpu: process.cpuUsage(cpuStart),
        rssEnd,
        sampledRssMax: Math.max(sampledRssMax, rssEnd),
        failureInjections,
      };
      assert.equal(
        counts.httpErrors,
        scenario === 'review-rollback' ? message.samples : 0,
        '예상하지 않은 HTTP 오류',
      );
      if (scenario === 'review-create' || scenario === 'review-rollback') {
        const expected = scenario === 'review-create' ? totalRequests : 0;
        assert.equal(await db.getRepository('Review').count(), expected);
        assert.equal(await db.getRepository('Watchlist').count(), expected);
        if (scenario === 'review-rollback')
          assert.equal(failureInjections, message.samples);
      }
      if (scenario === 'detail-miss')
        assert.equal(
          await db.getRepository('Content').count(),
          dataSize + totalRequests,
        );
      if (scenario === 'detail-stale')
        assert.equal(
          await db
            .getRepository('Content')
            .createQueryBuilder('c')
            .where('c.title LIKE :prefix', { prefix: '외부 작품 %' })
            .getCount(),
          totalRequests,
        );
      if (scenario === 'rankings-refresh')
        assert.equal(await db.getRepository('Ranking').count(), 1);
      if (scenario.startsWith('chat'))
        assert.equal(
          await db
            .getRepository('ContentMetadata')
            .countBy({ description: '고정 metadata 설명' }),
          dataSize,
        );
      assert.deepEqual(counts.unexpected, []);
      return result;
    }
    case 'close':
      await closeApp();
      return null;
    default:
      throw new Error('알 수 없는 benchmark worker 명령');
  }
}

let queue = Promise.resolve();
process.on('message', (message) => {
  queue = queue
    .then(async () => {
      assert(
        message &&
          Number.isInteger(message.id) &&
          typeof message.type === 'string',
      );
      try {
        const result = await dispatch(message);
        if (process.connected) process.send({ id: message.id, result });
      } catch (error) {
        if (process.connected)
          process.send({ id: message.id, error: error.stack ?? String(error) });
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
});
process.on('disconnect', () => {
  void closeApp().finally(() => {
    clock.uninstall();
    process.exit();
  });
});
process.send({ ready: true, node: process.version, pid: process.pid });
