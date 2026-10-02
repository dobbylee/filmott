import { Injectable } from '@nestjs/common';
import { getHeapStatistics } from 'node:v8';
import { Gauge, Registry } from '@prometheus-io/client';

@Injectable()
export class ProcessMetricsService {
  private readonly registry = new Registry();

  constructor() {
    new Gauge({
      name: 'filmott_node_heap_used_bytes',
      help: 'Bytes used by the application V8 heap.',
      registers: [this.registry],
      collect() {
        this.set(process.memoryUsage().heapUsed);
      },
    });
    new Gauge({
      name: 'filmott_node_heap_limit_bytes',
      help: 'Application V8 heap size limit in bytes.',
      registers: [this.registry],
      collect() {
        this.set(getHeapStatistics().heap_size_limit);
      },
    });
    new Gauge({
      name: 'filmott_process_resident_memory_bytes',
      help: 'Application process resident memory in bytes.',
      registers: [this.registry],
      collect() {
        this.set(process.memoryUsage.rss());
      },
    });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
