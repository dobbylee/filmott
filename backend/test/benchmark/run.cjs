const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { performance } = require('node:perf_hooks');
const { createHash, randomBytes } = require('node:crypto');
const { fork, execFileSync } = require('node:child_process');
const {
  scenarios,
  parseArgs,
  fingerprint,
  summarize,
  compare,
} = require('./metrics.cjs');

const backend = path.resolve(__dirname, '../..');
const repository = path.dirname(backend);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readHash = (file) => sha256(fs.readFileSync(file));
function verifyDependencyRoot(root) {
  assert.equal(
    fs.realpathSync(path.join(root, 'node_modules')),
    fs.realpathSync(path.join(backend, 'node_modules')),
    'source와 harness는 같은 node_modules realpath를 공유해야 합니다. --capture-baseline으로 보존한 소스를 사용하세요.',
  );
}
const harnessHash = () =>
  sha256(
    [
      'run.cjs',
      'worker.cjs',
      'metrics.cjs',
      'fixtures.cjs',
      '../contracts/openai-fixtures.ts',
    ]
      .map((file) => readHash(path.join(__dirname, file)))
      .join('\n'),
  );

function sourceIdentity(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && !entry.name.endsWith('.spec.ts'))
        files.push(file);
    }
  }
  visit(path.join(root, 'src'));
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json'])
    files.push(path.join(root, name));
  const hash = sha256(
    files
      .sort()
      .map((file) => `${path.relative(root, file)}\0${readHash(file)}`)
      .join('\n'),
  );
  const captured = path.join(root, '.benchmark-source.json');
  if (fs.existsSync(captured)) {
    const manifest = JSON.parse(fs.readFileSync(captured, 'utf8'));
    assert.equal(hash, manifest.hash, '보존한 기준 소스가 바뀌었습니다.');
    return { ...manifest, root };
  }
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain'], {
    encoding: 'utf8',
  }).trim();
  return {
    root,
    sha,
    hash,
    lockHash: readHash(path.join(root, 'package-lock.json')),
    dirty: Boolean(dirty),
  };
}

function captureBaseline() {
  const identity = sourceIdentity(backend);
  assert.equal(
    identity.dirty,
    false,
    '기준 소스 보존 전 커밋·검증을 완료해야 합니다.',
  );
  const target = path.join(
    repository,
    'docs/refactoring/baselines',
    identity.sha,
  );
  const root = path.join(target, 'backend');
  if (fs.existsSync(root)) {
    assert.equal(sourceIdentity(root).hash, identity.hash);
    return root;
  }
  fs.mkdirSync(target, { recursive: true });
  // .env·ignored 파일·사용자 데이터는 archive에 포함하지 않는다.
  const archive = execFileSync(
    'git',
    [
      '-C',
      repository,
      'archive',
      identity.sha,
      'backend/src',
      'backend/package.json',
      'backend/package-lock.json',
      'backend/tsconfig.json',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  execFileSync('tar', ['-xf', '-', '-C', target], { input: archive });
  fs.symlinkSync(
    path.join(backend, 'node_modules'),
    path.join(root, 'node_modules'),
    'dir',
  );
  fs.writeFileSync(
    path.join(root, '.benchmark-source.json'),
    JSON.stringify(identity, null, 2) + '\n',
  );
  assert.equal(sourceIdentity(root).hash, identity.hash);
  return root;
}

function spawnWorker(root, environment) {
  const child = fork(path.join(__dirname, 'worker.cjs'), [], {
    cwd: root,
    execArgv: [
      '--expose-gc',
      '-r',
      require.resolve('ts-node/register/transpile-only'),
    ],
    env: {
      ...process.env,
      ...environment,
      NODE_ENV: 'test',
      NODE_OPTIONS: '',
      TZ: 'Asia/Seoul',
      SENTRY_DSN: '',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      TS_NODE_COMPILER_OPTIONS: '{}',
      TS_NODE_PROJECT: path.join(root, 'tsconfig.json'),
      FILMOTT_BENCHMARK_SOURCE_ROOT: root,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let id = 0;
  const pending = new Map();
  let log = '';
  child.stdout.on('data', (data) => {
    log = (log + data).slice(-16000);
  });
  child.stderr.on('data', (data) => {
    log = (log + data).slice(-16000);
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`worker 준비 시간 초과: ${log}`)),
      30000,
    );
    child.on('message', (message) => {
      if (message.ready) {
        clearTimeout(timer);
        resolve(message);
      }
      const waiter = pending.get(message.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error));
        else waiter.resolve(message.result);
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      const error = new Error(`worker 종료 ${code}/${signal}: ${log}`);
      reject(error);
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
      pending.clear();
    });
    child.once('error', reject);
  });
  function command(type, payload = {}, timeoutMs = 30000) {
    assert(child.connected, 'worker가 종료됐습니다.');
    return new Promise((resolve, reject) => {
      const next = ++id;
      const timer = setTimeout(() => {
        pending.delete(next);
        reject(new Error(`${type} 명령 시간 초과`));
      }, timeoutMs);
      pending.set(next, { resolve, reject, timer });
      child.send({ id: next, type, ...payload });
    });
  }
  async function close() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    let closeError;
    try {
      await command('close', {}, 5000);
    } catch (error) {
      closeError = error;
    }
    if (child.connected) child.disconnect();
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null)
        return resolve();
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (closeError) throw closeError;
  }
  return { ready, command, close, child };
}

function requestDescriptor(scenario, index, configuration) {
  const unique = index + 100;
  const defaults = { method: 'GET', token: null, body: undefined };
  const routes = {
    'detail-hit': '/api/contents/movie/100',
    'detail-miss': `/api/contents/movie/${1000000 + index}`,
    'detail-stale': `/api/contents/movie/${unique}`,
    'person-hit': '/api/contents/person/100',
    'person-miss': `/api/contents/person/${20000 + index}`,
    'related-hit': '/api/contents/movie/100/related',
    'related-miss': `/api/contents/movie/${unique}/related`,
    sitemap: '/api/contents/sitemap',
    'rankings-read':
      '/api/rankings?source=kobis&category=daily-box-office&limit=10',
  };
  if (routes[scenario]) return { ...defaults, path: routes[scenario] };
  if (scenario === 'rankings-refresh')
    return {
      method: 'POST',
      path: '/api/rankings/refresh/daily-box-office',
      token: configuration.tokens[0],
    };
  if (scenario.startsWith('review'))
    return {
      method: 'POST',
      path: '/api/reviews',
      token: configuration.tokens[0],
      body: {
        contentId: index + 1,
        rating: 8,
        comment: '벤치마크 리뷰',
        watchedAt: '2025-01-01',
      },
    };
  assert(scenario.startsWith('chat'));
  return {
    method: 'POST',
    path: '/api/chat/messages',
    token: configuration.tokens[index],
    body: { content: '드라마 영화 추천해줘' },
  };
}

function requestOnce(baseUrl, descriptor, agent) {
  return new Promise((resolve, reject) => {
    const body =
      descriptor.body === undefined
        ? undefined
        : JSON.stringify(descriptor.body);
    const started = performance.now();
    const request = http.request(
      new URL(descriptor.path, baseUrl),
      {
        method: descriptor.method,
        agent,
        headers: {
          ...(descriptor.token
            ? { Authorization: `Bearer ${descriptor.token}` }
            : {}),
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        let firstTextMs = null;
        let prefix = '';
        const isSse = String(response.headers['content-type']).includes(
          'text/event-stream',
        );
        response.on('data', (chunk) => {
          chunks.push(chunk);
          if (isSse && firstTextMs === null) {
            prefix += chunk.toString();
            if (prefix.includes('event: text\n'))
              firstTextMs = performance.now() - started;
          }
        });
        response.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        response.once('end', () => {
          clearTimeout(timer);
          const ms = performance.now() - started;
          try {
            const text = Buffer.concat(chunks).toString();
            const parsed = isSse
              ? text
                  .trim()
                  .split('\n\n')
                  .filter(Boolean)
                  .map((frame) => {
                    const [event, data] = frame.split('\n');
                    return {
                      event: event.slice(7),
                      data: JSON.parse(data.slice(6)),
                    };
                  })
              : JSON.parse(text);
            resolve({
              status: response.statusCode,
              contentType: response.headers['content-type'],
              body: parsed,
              ms,
              firstTextMs,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error('HTTP 벤치마크 요청 시간 초과')),
      15000,
    );
    request.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end(body);
  });
}

function validateResponse(scenario, response, index, configuration) {
  assert.equal(
    response.status,
    scenario === 'review-rollback'
      ? 500
      : scenario.startsWith('review') ||
          scenario.startsWith('chat') ||
          scenario === 'rankings-refresh'
        ? 201
        : 200,
  );
  if (scenario.startsWith('detail'))
    assert.equal(
      response.body.tmdbId,
      scenario === 'detail-hit'
        ? 100
        : scenario === 'detail-miss'
          ? 1000000 + index
          : index + 100,
    );
  if (['detail-miss', 'review-create'].includes(scenario)) {
    for (const field of ['createdAt', 'updatedAt'])
      assert(
        Math.abs(Date.now() - Date.parse(response.body[field])) < 60000,
        'DB 생성 시각이 요청 시각과 맞지 않습니다.',
      );
  }
  if (scenario.startsWith('person'))
    assert.equal(
      response.body.id,
      scenario === 'person-hit' ? 100 : 20000 + index,
    );
  if (scenario.startsWith('related')) assert.equal(response.body.length, 6);
  if (scenario === 'sitemap')
    assert.equal(response.body.length, configuration.dataSize);
  if (scenario === 'rankings-read') assert.equal(response.body.length, 10);
  if (scenario === 'rankings-refresh') {
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].title, '외부 랭킹');
  }
  if (scenario === 'review-create') {
    assert.equal(response.body.contentId, index + 1);
    assert.equal(response.body.rating, 8);
  }
  if (scenario.startsWith('chat')) {
    assert.equal(response.body.at(-1)?.event, 'done');
    assert(
      response.body.every(
        (event) => event.event !== 'error' && event.event !== 'reset',
      ),
    );
    assert(response.firstTextMs !== null);
    assert.deepEqual(
      response.body.find((event) => event.event === 'recommendations')?.data,
      {
        recommendations: [
          {
            tmdbId: 100,
            contentType: 'movie',
            title: '벤치마크 대표 작품',
            posterUrl: '/poster.jpg',
          },
        ],
      },
    );
  }
}

async function executeScenario(
  worker,
  scenario,
  options,
  record,
  rawPath,
  checkpoint,
) {
  const slow = scenario === 'rankings-refresh' && !options.smoke;
  const warmup = slow ? 5 : options.warmup;
  const count = slow ? 20 : options.requests;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  let fd;
  let phase = 'prepare';
  let position = null;
  let response;
  let measuredAt;
  const append = (value) => {
    if (fd !== undefined) fs.writeSync(fd, JSON.stringify(value) + '\n');
  };
  Object.assign(record, {
    warmup,
    requestedSamples: count,
    warmupCompleted: 0,
    status: 'preparing',
    samples: [],
  });
  try {
    fd = fs.openSync(rawPath, 'wx');
    const configuration = await worker.command('prepare', {
      options: {
        scenario,
        dataset: options.dataset,
        totalRequests: warmup + count,
      },
    });
    const { tokens, url, ...environment } = configuration;
    record.environment = environment;
    record.status = 'warming-up';
    append({ type: 'prepared', environment });
    checkpoint();
    phase = 'warmup';
    for (let index = 0; index < warmup; index++) {
      position = index;
      response = undefined;
      response = await requestOnce(
        configuration.url,
        requestDescriptor(scenario, index, configuration),
        agent,
      );
      validateResponse(scenario, response, index, configuration);
      if (scenario === 'detail-stale' || scenario.startsWith('chat'))
        await worker.command('drain');
      record.warmupCompleted++;
      append({
        type: 'warmup',
        index,
        ms: response.ms,
        fingerprint: fingerprint(scenario, response),
      });
    }
    phase = 'begin';
    position = null;
    record.status = 'starting-measurement';
    checkpoint();
    await worker.command('begin');
    const started = performance.now();
    measuredAt = started;
    phase = 'measure';
    record.status = 'measuring';
    for (let index = warmup; index < warmup + count; index++) {
      position = index;
      response = undefined;
      const requestStart = performance.now();
      response = await requestOnce(
        configuration.url,
        requestDescriptor(scenario, index, configuration),
        agent,
      );
      validateResponse(scenario, response, index, configuration);
      if (scenario === 'detail-stale' || scenario.startsWith('chat'))
        await worker.command('drain');
      const sample = {
        index,
        ms: response.ms,
        firstTextMs: response.firstTextMs,
        completeMs: performance.now() - requestStart,
        fingerprint: fingerprint(scenario, response),
      };
      record.samples.push(sample);
      append({ type: 'sample', ...sample });
    }
    const durationMs = performance.now() - started;
    phase = 'end';
    position = null;
    record.durationMs = durationMs;
    const measurement = await worker.command('end', { samples: count });
    record.worker = measurement;
    record.summary = summarize(record.samples, measurement, durationMs);
    record.status = 'complete';
    append({ type: 'complete', summary: record.summary });
    checkpoint();
    return record;
  } catch (error) {
    record.status = 'failed';
    if (measuredAt !== undefined)
      record.durationMs = performance.now() - measuredAt;
    record.failure = {
      phase,
      index: position,
      message: String(error),
      ...(response
        ? {
            status: response.status,
            ms: response.ms,
            rawBodyHash: sha256(JSON.stringify(response.body)),
          }
        : {}),
    };
    append({ type: 'failure', ...record.failure });
    try {
      record.partialWorker = await worker.command('snapshot', {}, 1000);
    } catch (snapshotError) {
      record.partialWorkerError = String(snapshotError);
    }
    checkpoint();
    throw error;
  } finally {
    agent.destroy();
    if (fd !== undefined) fs.closeSync(fd);
  }
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const baselineRoot = options.captureBaseline
    ? captureBaseline()
    : path.resolve(options['baseline-root'] ?? backend);
  const candidateRoot = path.resolve(options['candidate-root'] ?? backend);
  verifyDependencyRoot(baselineRoot);
  verifyDependencyRoot(candidateRoot);
  const sources = {
    before: sourceIdentity(baselineRoot),
    after: sourceIdentity(candidateRoot),
  };
  if (!options.smoke)
    for (const source of Object.values(sources))
      assert.equal(
        source.dirty,
        false,
        '측정 전 소스 커밋·검증을 완료해야 합니다.',
      );
  assert.equal(
    sources.before.lockHash,
    sources.after.lockHash,
    '의존성이 다른 비교는 허용하지 않습니다.',
  );
  const output = path.resolve(
    options.output ??
      path.join(
        repository,
        'docs/refactoring/benchmarks',
        new Date().toISOString().replace(/[:.]/g, '-'),
      ),
  );
  assert(
    !fs.existsSync(path.join(output, 'report.json')),
    '기존 벤치마크 결과를 덮어쓰지 않습니다. 새 출력 경로가 필요합니다.',
  );
  fs.mkdirSync(output, { recursive: true });
  const container = `filmott-benchmark-${process.pid}-${randomBytes(4).toString('hex')}`;
  const password = randomBytes(18).toString('hex');
  const report = {
    startedAt: new Date().toISOString(),
    mode: options.smoke
      ? 'smoke-not-baseline'
      : sources.before.hash === sources.after.hash
        ? 'A/A'
        : 'A/B',
    options,
    sources,
    harnessHash: harnessHash(),
    dependencyTreeHash: readHash(
      path.join(backend, 'node_modules/.package-lock.json'),
    ),
    baselineEligible: false,
    machine: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      totalMemory: os.totalmem(),
      execution:
        'Node + ts-node transpile-only; fresh worker per scenario/variant/run',
    },
    db: { image: 'pgvector/pgvector:pg18', cpus: 2, memory: '768m', container },
    runs: { before: [], after: [] },
    workers: [],
    status: 'running',
  };
  let created = false;
  let worker;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    worker?.child.kill('SIGTERM');
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const write = () =>
    fs.writeFileSync(
      path.join(output, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  try {
    write();
    report.db.imageId = execFileSync(
      'docker',
      ['image', 'inspect', report.db.image, '--format', '{{.Id}}'],
      { encoding: 'utf8' },
    ).trim();
    execFileSync(
      'docker',
      [
        'run',
        '--pull=never',
        '--rm',
        '-d',
        '--name',
        container,
        '--cpus=2',
        '--memory=768m',
        '--label',
        'codex.filmott.benchmark=true',
        '-e',
        'POSTGRES_USER=benchmark',
        '-e',
        `POSTGRES_PASSWORD=${password}`,
        '-e',
        'POSTGRES_DB=filmott_benchmark_test',
        '-p',
        '127.0.0.1::5432',
        report.db.image,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    created = true;
    write();
    const port = execFileSync('docker', ['port', container, '5432/tcp'], {
      encoding: 'utf8',
    })
      .trim()
      .split(':')
      .at(-1);
    let ready = false;
    for (let attempt = 0; attempt < 50 && !interrupted; attempt++) {
      try {
        execFileSync(
          'docker',
          [
            'exec',
            container,
            'pg_isready',
            '-h',
            '127.0.0.1',
            '-U',
            'benchmark',
          ],
          { stdio: 'ignore' },
        );
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    assert(ready && !interrupted, '테스트 DB가 준비되지 않았습니다.');
    for (let run = 0; run < options.runs; run++) {
      for (const scenario of options.selected) {
        for (const variant of run % 2 === 0
          ? ['before', 'after']
          : ['after', 'before']) {
          assert(!interrupted, '벤치마크가 중단됐습니다.');
          worker = spawnWorker(sources[variant].root, {
            TEST_DB_NAME: 'filmott_benchmark_test',
            TEST_DB_HOST: '127.0.0.1',
            TEST_DB_PORT: port,
            TEST_DB_USERNAME: 'benchmark',
            TEST_DB_PASSWORD: password,
            FILMOTT_BENCHMARK_FAILURE: options.injectFailure ?? '',
          });
          const readyWorker = await worker.ready;
          report.workers.push({
            variant,
            scenario,
            run: run + 1,
            pid: readyWorker.pid,
          });
          write();
          assert(!interrupted, '벤치마크가 중단됐습니다.');
          const result = {
            run: run + 1,
            scenario,
            status: 'preparing',
            samples: [],
            rawFile: `${variant}-${run + 1}-${scenario}.ndjson`,
          };
          report.runs[variant].push(result);
          write();
          await executeScenario(
            worker,
            scenario,
            options,
            result,
            path.join(output, result.rawFile),
            write,
          );
          console.log(
            `${variant} ${run + 1}/${options.runs} ${scenario}: p50=${result.summary.p50Ms.toFixed(2)}ms p95=${result.summary.p95Ms.toFixed(2)}ms`,
          );
          write();
          await worker.close();
          worker = undefined;
        }
      }
    }
    for (const [variant, source] of Object.entries(sources))
      assert.equal(
        sourceIdentity(source.root).hash,
        source.hash,
        `${variant} 소스가 측정 중 바뀌었습니다.`,
      );
    assert.equal(
      harnessHash(),
      report.harnessHash,
      '측정 중 runner/fixture가 바뀌었습니다.',
    );
    assert.equal(
      readHash(path.join(backend, 'node_modules/.package-lock.json')),
      report.dependencyTreeHash,
      '측정 중 설치된 의존성이 바뀌었습니다.',
    );
    report.findings = compare(report.runs.before, report.runs.after);
    if (report.mode === 'A/A')
      report.findings.push(
        ...compare(report.runs.after, report.runs.before, {
          before: 'after',
          after: 'before',
        }),
      );
    report.findings = [...new Set(report.findings)];
    report.completeComparison =
      !options.smoke &&
      options.selected.length === scenarios.length &&
      report.findings.length === 0;
    report.baselineEligible =
      report.mode === 'A/A' && report.completeComparison;
    const semanticFailure = report.findings.some((finding) =>
      /fingerprint|dbCalls|externalCalls|httpErrors|count/.test(finding),
    );
    report.status = options.smoke
      ? semanticFailure
        ? 'smoke-failed'
        : 'smoke-complete'
      : report.findings.length
        ? 'comparison-inconclusive-or-regression'
        : 'comparison-passed';
    if (options.smoke && semanticFailure) process.exitCode = 1;
    if (!options.smoke && report.findings.length) process.exitCode = 2;
  } catch (error) {
    report.status = interrupted ? 'interrupted' : 'failed';
    report.error = error.stack ?? String(error);
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    try {
      await worker?.close();
    } catch (error) {
      report.status = 'failed';
      report.error = String(error);
      process.exitCode = 1;
    } finally {
      try {
        if (created)
          execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
        report.cleanup = 'complete';
      } catch (error) {
        report.status = 'failed';
        report.cleanup = 'failed';
        report.error = String(error);
        process.exitCode = 1;
      }
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      report.finishedAt = new Date().toISOString();
      if (
        report.status !== 'comparison-passed' ||
        report.cleanup !== 'complete'
      ) {
        report.baselineEligible = false;
        report.completeComparison = false;
      }
      write();
    }
  }
  console.log(`${report.status}: ${output}`);
  return report;
}

if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = {
  sourceIdentity,
  verifyDependencyRoot,
  requestDescriptor,
  validateResponse,
  main,
};
