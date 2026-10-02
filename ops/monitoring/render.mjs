import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 자격값 없이 dashboard/provisioning payload를 만든다. 네트워크 요청은 하지 않는다.
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const uid = args.includes('--datasource') ? option('--datasource') : '';
const out = args.includes('--out') ? option('--out') : '';
if (!/^[\w-]{1,80}$/.test(uid) || !out) {
  throw new Error('사용법: node ops/monitoring/render.mjs --datasource UID --out DIRECTORY [--with-synthetic] [--enable-alerts]');
}
const specs = JSON.parse(await readFile(new URL('./alerts.json', import.meta.url), 'utf8'))
  .filter((rule) => !rule.requiresSyntheticCheck || args.includes('--with-synthetic'));
const datasource = { type: 'prometheus', uid };
const panels = [
  ['V8 heap 사용률', 'timeseries', 'percentunit', 'filmott_node_heap_used_bytes{job="filmott-process"} / filmott_node_heap_limit_bytes{job="filmott-process"}'],
  ['프로세스 RSS', 'timeseries', 'bytes', 'filmott_process_resident_memory_bytes{job="filmott-process"}'],
  ['V8 heap 사용량과 한도', 'timeseries', 'bytes', '{__name__=~"filmott_node_heap_used_bytes|filmott_node_heap_limit_bytes",job="filmott-process"}'],
  ['내부 수집 상태', 'timeseries', 'short', 'up{job=~"filmott-process|filmott-release|filmott-collector"}'],
  ['현재 Nginx release', 'table', 'short', 'filmott_active_release_info{job="filmott-release"} and on(job,instance) (up{job="filmott-release"} == 1)'],
  ['remote-write 마지막 성공 후 경과', 'timeseries', 's', 'time() - prometheus_remote_storage_queue_highest_sent_timestamp_seconds{job="filmott-collector"}'],
  ['공개 API probe (연결 전에는 데이터 없음)', 'timeseries', 'short', 'probe_success{job="filmott-public-api"}'],
];
const dashboard = {
  uid: 'filmott-minimal', title: 'Filmott 기본 운영 관측', tags: ['filmott'], schemaVersion: 41,
  timezone: 'Asia/Seoul', refresh: '30s', time: { from: 'now-6h', to: 'now' },
  description: '메모리·내부 수집·현재 Nginx release·외부 API. 수집 누락을 0으로 채우지 않습니다. release와 process는 별도 scrape로 전환 순간 원자적 snapshot은 아닙니다.',
  panels: panels.map(([title, type, unit, expr], i) => ({
    id: i + 1, title, type, datasource, gridPos: { x: (i % 2) * 12, y: Math.floor(i / 2) * 8, w: 12, h: 8 },
    fieldConfig: { defaults: { unit, custom: { spanNulls: false } }, overrides: [] },
    targets: [{ refId: 'A', expr, datasource, instant: type === 'table', range: type !== 'table', format: type === 'table' ? 'table' : 'time_series', legendFormat: '{{job}} {{__name__}}' }],
    options: type === 'table' ? { showHeader: true } : { legend: { displayMode: 'list', placement: 'bottom' } },
  })),
};
const rules = specs.map((rule) => ({
  uid: rule.uid, title: rule.title, condition: 'B', for: rule.for,
  noDataState: 'NoData', execErrState: 'Alerting', isPaused: !args.includes('--enable-alerts'),
  labels: { service: 'filmott', severity: rule.severity },
  annotations: { summary: rule.summary },
  data: [
    { refId: 'A', queryType: '', relativeTimeRange: { from: 600, to: 0 }, datasourceUid: uid,
      model: { refId: 'A', expr: rule.expr, instant: true, range: false, datasource, intervalMs: 1000, maxDataPoints: 43200 } },
    { refId: 'B', relativeTimeRange: { from: 0, to: 0 }, datasourceUid: '__expr__',
      model: { refId: 'B', type: 'threshold', expression: 'A', datasource: { type: '__expr__', uid: '__expr__' },
        conditions: [{ evaluator: { params: [0], type: 'gt' }, operator: { type: 'and' }, query: { params: ['B'] }, reducer: { params: [], type: 'last' }, type: 'query' }] } },
  ],
}));
await mkdir(out, { recursive: true });
for (const [name, data] of Object.entries({
  'dashboard.json': dashboard,
  'grafana-alerts.json': { apiVersion: 1, groups: [{ orgId: 1, name: 'filmott-minimal', folder: 'Filmott', interval: '1m', rules }] },
  'prometheus-rules.json': { groups: [{ name: 'filmott-minimal', rules: specs.map(r => ({ alert: r.uid, expr: `(${r.expr}) > 0`, for: r.for, labels: { service: 'filmott', severity: r.severity }, annotations: { summary: r.summary } })) }] },
})) {
  await writeFile(path.join(out, name), JSON.stringify(data, null, 2) + '\n');
}
console.log(`생성 완료: ${path.resolve(out)} (alert ${rules.length}개)`);
