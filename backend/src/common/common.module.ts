import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RevalidateService } from './revalidate.service';

@Module({
  imports: [ConfigModule],
  providers: [RevalidateService],
  exports: [RevalidateService],
})
export class CommonModule {}
