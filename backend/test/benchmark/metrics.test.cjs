const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  scenarios,
  parseArgs,
  percentile,
  fingerprint,
  summarize,
  compare,
} = require('./metrics.cjs');
const {
  main,
  verifyDependencyRoot,
  requestDescriptor,
  validateResponse,
} = require('./run.cjs');

test('runner·worker는 실행 없이 문법 검사를 통과해야 한다', () => {
  for (const file of ['run.cjs', 'worker.cjs', 'metrics.cjs'])
    execFileSync(process.execPath, ['--check', path.join(__dirname, file)]);
});

test('기준선 표본과 smoke 예산을 혼동하거나 무제한 실행할 수 없어야 한다', () => {
  assert.deepEqual(parseArgs([]).selected, scenarios);
  assert.equal(parseArgs(['--smoke']).requests, 3);
  for (const args of [
    ['--requests', '499'],
    ['--runs', '4'],
    ['--dataset', '999999'],
    ['--smoke', '--runs', '5'],
    ['--scenario', 'unknown'],
    ['--output'],
    ['--inject-failure', 'prepare'],
  ]) {
    assert.throws(() => parseArgs(args));
  }
  assert.equal(
    parseArgs(['--smoke', '--inject-failure', 'prepare']).injectFailure,
    'prepare',
  );
});

test('백분위는 nearest-rank로 계산하고 빈 값·NaN을 허용하지 않아야 한다', () => {
  const samples = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(percentile(samples, 0.5), 50);
  assert.equal(percentile(samples, 0.95), 95);
  assert.throws(() => percentile([], 0.95));
  assert.throws(() => percentile([NaN], 0.5));
});

test('정규화는 허용한 생성 시각만 바꾸고 ID·배열 순서 차이를 보존해야 한다', () => {
  const response = (id, createdAt, list = [1, 2]) => ({
    status: 201,
    contentType: 'application/json',
    body: {
      id,
      createdAt,
      updatedAt: createdAt,
      list,
      releaseDate: '2025-01-01',
    },
  });
  const a = response(1, '2026-01-01T00:00:00.000Z');
  const b = response(1, '2026-02-01T00:00:00.000Z');
  assert.equal(
    fingerprint('review-create', a),
    fingerprint('review-create', b),
  );
  assert.notEqual(fingerprint('detail-hit', a), fingerprint('detail-hit', b));
  assert.notEqual(
    fingerprint('review-create', a),
    fingerprint('review-create', response(2, b.body.createdAt)),
  );
  assert.notEqual(
    fingerprint('review-create', a),
    fingerprint('review-create', response(1, b.body.createdAt, [2, 1])),
  );
  assert.throws(() => fingerprint('review-create', response(1, 'not-a-date')));
});

test('미완료 요청과 외부 fixture 누락은 요약 단계에서 실패해야 한다', () => {
  const samples = [{ ms: 1, completeMs: 2, firstTextMs: null }];
  assert.throws(() => summarize(samples, { completed: 0, unexpected: [] }, 10));
  assert.throws(() =>
    summarize(
      samples,
      { completed: 1, unexpected: ['unexpected request'] },
      10,
    ),
  );
});

function result(p95 = 2) {
  return {
    scenario: 'detail-hit',
    samples: [{ fingerprint: 'fixed' }],
    summary: {
      p50Ms: 1,
      p95Ms: p95,
      completeP50Ms: 1,
      cpuMsPerRequest: 0.1,
      sampledRssMax: 100000000,
      throughput: 100,
      dbCalls: 2,
      externalCalls: 0,
      httpErrors: 0,
      count: 1,
    },
  };
}

test('호출·응답 차이와 느려짐·반복 변동을 통과로 처리하지 않아야 한다', () => {
  assert.deepEqual(compare([result()], [result()]), []);
  const changed = result();
  changed.samples[0].fingerprint = 'different';
  changed.summary.dbCalls = 3;
  assert(
    compare([result()], [changed]).some((finding) =>
      finding.includes('fingerprint'),
    ),
  );
  assert(
    compare([result()], [changed]).some((finding) =>
      finding.includes('dbCalls'),
    ),
  );
  assert(
    compare([result()], [result(8)]).some((finding) =>
      finding.includes('p95Ms 증가'),
    ),
  );
  const noisy = [result(), result(), result(), result(), result(8)];
  assert(
    compare(noisy, noisy).some((finding) => finding.includes('반복 변동')),
  );
});

test('채팅 부하는 동등한 별도 사용자로 guard를 유지하고 빠른 오류는 거부해야 한다', () => {
  const configuration = { tokens: ['first', 'second'] };
  assert.equal(requestDescriptor('chat', 0, configuration).token, 'first');
  assert.equal(requestDescriptor('chat', 1, configuration).token, 'second');
  assert.throws(() =>
    validateResponse('detail-hit', { status: 500, body: {} }, 0, {}),
  );
  assert.throws(() =>
    validateResponse('related-hit', { status: 200, body: [] }, 0, {}),
  );
});

test('기존 결과 파일은 Docker를 시작하기 전에 덮어쓰기를 거부해야 한다', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'filmott-benchmark-policy-'),
  );
  try {
    const file = path.join(directory, 'report.json');
    fs.writeFileSync(file, 'original');
    await assert.rejects(main(['--smoke', '--output', directory]), /덮어쓰지/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'original');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('별도 checkout의 의존성은 거부하고 동일 realpath의 snapshot만 허용해야 한다', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'filmott-benchmark-deps-'),
  );
  const modules = path.join(directory, 'node_modules');
  try {
    fs.mkdirSync(modules);
    assert.throws(() => verifyDependencyRoot(directory), /realpath/);
    fs.rmdirSync(modules);
    fs.symlinkSync(
      path.resolve(__dirname, '../../node_modules'),
      modules,
      'dir',
    );
    assert.doesNotThrow(() => verifyDependencyRoot(directory));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
