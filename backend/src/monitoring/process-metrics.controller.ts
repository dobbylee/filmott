import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Registry } from '@prometheus-io/client';
import { ProcessMetricsService } from './process-metrics.service';

// 운영에서는 공용 Nginx가 이 경로를 차단하고 내부 listener만 전달한다.
@Controller('internal/metrics')
export class ProcessMetricsController {
  constructor(private readonly metricsService: ProcessMetricsService) {}

  @Get()
  @Header('Content-Type', Registry.PROMETHEUS_CONTENT_TYPE)
  @Header('Cache-Control', 'no-store')
  async getMetrics(): Promise<string> {
    try {
      return await this.metricsService.metrics();
    } catch {
      // 수집 누락을 0으로 응답하거나 내부 오류 원문을 공개하지 않는다.
      throw new ServiceUnavailableException('Metrics unavailable');
    }
  }
}
