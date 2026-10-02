import { Module } from '@nestjs/common';
import { ProcessMetricsController } from './process-metrics.controller';
import { ProcessMetricsService } from './process-metrics.service';

@Module({
  controllers: [ProcessMetricsController],
  providers: [ProcessMetricsService],
})
export class MonitoringModule {}
