import { getHeapStatistics } from 'node:v8';
import { ProcessMetricsService } from './process-metrics.service';

describe('프로세스 메모리 계측', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scrape마다 현재 프로세스 값을 고정된 세 gauge로 제공해야 한다', async () => {
    const memory = process.memoryUsage();
    const heap = jest.spyOn(process, 'memoryUsage');
    heap.mockReturnValue({ ...memory, heapUsed: 1234 });
    process.memoryUsage.rss = jest.fn().mockReturnValue(5678);
    const service = new ProcessMetricsService();
    const first = await service.metrics();
    expect(first).toContain('filmott_node_heap_used_bytes 1234\n');
    expect(first).toContain('filmott_process_resident_memory_bytes 5678\n');
    expect(first).toContain(
      `filmott_node_heap_limit_bytes ${getHeapStatistics().heap_size_limit}\n`,
    );
    expect(
      first.split('\n').filter((line) => line && !line.startsWith('#')),
    ).toHaveLength(3);
    expect(first).not.toContain('{');
    heap.mockReturnValue({ ...memory, heapUsed: 2345 });
    expect(await service.metrics()).toContain(
      'filmott_node_heap_used_bytes 2345\n',
    );
  });

  it('독립 앱 인스턴스가 전역 registry에 중복 등록하지 않아야 한다', async () => {
    for (const service of [
      new ProcessMetricsService(),
      new ProcessMetricsService(),
    ]) {
      expect(await service.metrics()).toContain(
        '# TYPE filmott_node_heap_used_bytes gauge',
      );
    }
  });
});
