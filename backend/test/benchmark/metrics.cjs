const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const scenarios = [
  'detail-hit',
  'detail-miss',
  'detail-stale',
  'person-hit',
  'person-miss',
  'related-hit',
  'related-miss',
  'sitemap',
  'rankings-read',
  'rankings-refresh',
  'review-create',
  'review-rollback',
  'chat',
  'chat-fallback',
];

function percentile(values, fraction) {
  assert(
    values.length > 0 &&
      values.every((value) => Number.isFinite(value) && value >= 0),
    '측정값이 없거나 유효하지 않습니다.',
  );
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function fingerprint(scenario, response) {
  const body = structuredClone(response.body);
  // 이 두 쓰기 응답의 DB 자동 생성 시각만 정규화한다. ID·배열·정책 날짜는 유지한다.
  if (['detail-miss', 'review-create'].includes(scenario)) {
    assert(
      Date.parse(body.createdAt) <= Date.parse(body.updatedAt),
      '생성·수정 시각의 순서가 잘못됐습니다.',
    );
    for (const field of ['createdAt', 'updatedAt']) {
      assert.equal(typeof body[field], 'string', `${field}가 누락됐습니다.`);
      assert.equal(
        new Date(body[field]).toISOString(),
        body[field],
        `${field}가 ISO 시각이 아닙니다.`,
      );
      body[field] = '<database-generated-iso-time>';
    }
  }
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          status: response.status,
          contentType: response.contentType,
          body,
        }),
      ),
    )
    .digest('hex');
}

function summarize(samples, worker, durationMs) {
  assert(samples.length > 0 && durationMs > 0, '빈 실행은 통과할 수 없습니다.');
  assert.equal(worker.completed, samples.length, '완료 응답 수가 다릅니다.');
  assert.equal(worker.unexpected.length, 0, '미등록 외부 요청이 발생했습니다.');
  const latency = samples.map((sample) => sample.ms);
  const firstText = samples
    .filter((sample) => sample.firstTextMs !== null)
    .map((sample) => sample.firstTextMs);
  return {
    count: samples.length,
    p50Ms: percentile(latency, 0.5),
    p95Ms: percentile(latency, 0.95),
    completeP50Ms: percentile(
      samples.map((sample) => sample.completeMs),
      0.5,
    ),
    firstTextP50Ms: firstText.length ? percentile(firstText, 0.5) : null,
    firstTextP95Ms: firstText.length ? percentile(firstText, 0.95) : null,
    throughput: (samples.length * 1000) / durationMs,
    cpuMsPerRequest:
      (worker.cpu.user + worker.cpu.system) / 1000 / samples.length,
    sampledRssMax: worker.sampledRssMax,
    rssEnd: worker.rssEnd,
    dbCalls: worker.dbCalls,
    externalCalls: worker.externalCalls,
    httpErrors: worker.httpErrors,
  };
}

function compare(before, after, labels = { before: 'before', after: 'after' }) {
  assert(
    before.length > 0 && before.length === after.length,
    '반복 수가 다릅니다.',
  );
  const findings = [];
  for (let index = 0; index < before.length; index++) {
    const a = before[index];
    const b = after[index];
    assert.equal(a.scenario, b.scenario);
    if (
      a.samples.length !== b.samples.length ||
      a.samples.some(
        (sample, i) => sample.fingerprint !== b.samples[i]?.fingerprint,
      )
    )
      findings.push(`${a.scenario}: 응답 fingerprint 불일치`);
    for (const key of ['dbCalls', 'externalCalls', 'httpErrors', 'count']) {
      if (a.summary[key] !== b.summary[key])
        findings.push(`${a.scenario}: ${key} 불일치`);
    }
  }
  for (const scenario of new Set(before.map((run) => run.scenario))) {
    const a = before.filter((run) => run.scenario === scenario);
    const b = after.filter((run) => run.scenario === scenario);
    const metrics = [
      ['p50Ms', 0.2, 1],
      ['completeP50Ms', 0.2, 1],
      ['cpuMsPerRequest', 0.2, 0.1],
      ['sampledRssMax', 0.1, 20 * 1024 * 1024],
    ];
    if (scenario !== 'rankings-refresh') metrics.push(['p95Ms', 0.2, 1]);
    if (scenario.startsWith('chat')) metrics.push(['firstTextP95Ms', 0.2, 1]);
    for (const [metric, ratio, absolute] of metrics) {
      const base = percentile(
        a.map((run) => run.summary[metric]),
        0.5,
      );
      const candidate = percentile(
        b.map((run) => run.summary[metric]),
        0.5,
      );
      for (const [label, runs, median] of [
        [labels.before, a, base],
        [labels.after, b, candidate],
      ]) {
        if (
          runs.some(
            (run) =>
              Math.abs(run.summary[metric] - median) >
              Math.max(median * ratio, absolute),
          )
        )
          findings.push(`${scenario}: ${label} ${metric} 반복 변동 초과`);
      }
      if (candidate > base + Math.max(base * ratio, absolute))
        findings.push(`${scenario}: ${metric} 증가`);
    }
    const throughputA = percentile(
      a.map((run) => run.summary.throughput),
      0.5,
    );
    const throughputB = percentile(
      b.map((run) => run.summary.throughput),
      0.5,
    );
    if (throughputB < throughputA * 0.8)
      findings.push(`${scenario}: 처리량 감소`);
  }
  return [...new Set(findings)];
}

function parseArgs(args) {
  const options = {
    smoke: false,
    runs: 5,
    requests: 500,
    warmup: 50,
    dataset: 1000,
    selected: scenarios,
  };
  let sized = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--smoke') {
      options.smoke = true;
      continue;
    }
    if (key === '--capture-baseline') {
      options.captureBaseline = true;
      continue;
    }
    const value = args[++index];
    assert(value && !value.startsWith('--'), `${key} 값이 없습니다.`);
    if (['--runs', '--requests', '--warmup', '--dataset'].includes(key)) {
      sized = true;
      assert(/^\d+$/.test(value), '양의 정수 옵션이 필요합니다.');
      options[key.slice(2)] = Number(value);
    } else if (key === '--inject-failure') {
      assert(
        ['prepare', 'close', 'sample'].includes(value),
        '알 수 없는 실패 주입',
      );
      options.injectFailure = value;
    } else if (
      ['--baseline-root', '--candidate-root', '--output'].includes(key)
    )
      options[key.slice(2)] = value;
    else if (key === '--scenario') {
      assert(scenarios.includes(value), '알 수 없는 시나리오');
      options.selected = [value];
    } else throw new Error(`알 수 없는 옵션: ${key}`);
  }
  if (options.smoke) {
    assert(
      !sized,
      'smoke의 고정 예산과 수동 표본 옵션을 함께 사용하지 않습니다.',
    );
    Object.assign(options, { runs: 1, requests: 3, warmup: 1, dataset: 20 });
  }
  assert(
    !options.injectFailure || options.smoke,
    '실패 주입은 smoke에서만 허용합니다.',
  );
  assert(
    options.runs >= 1 &&
      options.runs <= 10 &&
      options.requests >= 1 &&
      options.requests <= 2000 &&
      options.warmup >= 0 &&
      options.warmup <= 200 &&
      options.dataset >= options.requests + options.warmup &&
      options.dataset <= 5000,
    '측정 예산/데이터 범위를 벗어났습니다.',
  );
  if (!options.smoke)
    assert(
      options.runs >= 5 && options.requests >= 500 && options.warmup >= 50,
      '기준선에는 5회·500요청·50예열 이상이 필요합니다.',
    );
  return options;
}

module.exports = {
  scenarios,
  percentile,
  canonical,
  fingerprint,
  summarize,
  compare,
  parseArgs,
};
