import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const out = process.argv[2];
if (!out) throw new Error('렌더링한 출력 디렉터리가 필요합니다.');
const series = (heap = 40, up = 1) => [
  { series: 'filmott_node_heap_used_bytes{job="filmott-process"}', values: `${heap}+0x40` },
  { series: 'filmott_node_heap_limit_bytes{job="filmott-process"}', values: '100+0x40' },
  { series: 'filmott_process_resident_memory_bytes{job="filmott-process"}', values: '150+0x40' },
  { series: 'filmott_active_release_info{job="filmott-release",slot="blue",sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', values: '1+0x40' },
  { series: 'up{job="filmott-process"}', values: `${up}+0x40` },
  { series: 'up{job="filmott-release"}', values: '1+0x40' },
];
const expected = (name, severity, summary) => [{ exp_labels: { service:'filmott',severity }, exp_annotations:{summary} }];
const cases = [
  { name:'정상 메모리와수집', interval:'30s', input_series:series(), alert_rule_test:[
    ...['filmott-heap-warning','filmott-heap-critical','filmott-scrape-failed','filmott-telemetry-missing'].map(alertname=>({eval_time:'15m',alertname,exp_alerts:[]}))] },
  { name:'80퍼센트 지속경고',interval:'30s',input_series:series(81),alert_rule_test:[
    {eval_time:'9m',alertname:'filmott-heap-warning',exp_alerts:[]},
    {eval_time:'10m',alertname:'filmott-heap-warning',exp_alerts:expected('filmott-heap-warning','warning','V8 heap 사용률이 80%를 10분 넘었습니다.')},
    {eval_time:'15m',alertname:'filmott-heap-critical',exp_alerts:[]}]},
  {name:'90퍼센트 지속경고',interval:'30s',input_series:series(91),alert_rule_test:[
    {eval_time:'4m',alertname:'filmott-heap-critical',exp_alerts:[]},
    {eval_time:'5m',alertname:'filmott-heap-critical',exp_alerts:expected('filmott-heap-critical','critical','V8 heap 사용률이 90%를 5분 넘었습니다.')}]},
  {name:'scrape실패',interval:'30s',input_series:series(40,0),alert_rule_test:[
    {eval_time:'2m',alertname:'filmott-scrape-failed',exp_alerts:expected('filmott-scrape-failed','warning','active backend 또는 release endpoint scrape가 2분간 실패했습니다.')}]},
  {name:'완전수집누락',interval:'30s',input_series:[],alert_rule_test:[
    {eval_time:'3m',alertname:'filmott-telemetry-missing',exp_alerts:expected('filmott-telemetry-missing','critical','필수 관측값이 3분간 도착하지 않았습니다. 서비스 정상으로 판단하지 마세요.')}]},
  {name:'일시실패회복',interval:'30s',input_series:series().map(s=>s.series==='up{job="filmott-process"}'?{...s,values:'1 0 0 1+0x37'}:s),alert_rule_test:[
    {eval_time:'3m',alertname:'filmott-scrape-failed',exp_alerts:[]}]},
];
await writeFile(path.join(out,'rule-tests.json'),JSON.stringify({rule_files:['prometheus-rules.json'],evaluation_interval:'30s',tests:cases},null,2));
