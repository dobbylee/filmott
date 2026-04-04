import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { R2StorageService } from './r2-storage.service';
import { RevalidateService } from './revalidate.service';

@Module({
  imports: [ConfigModule],
  providers: [R2StorageService, RevalidateService],
  exports: [R2StorageService, RevalidateService],
})
export class CommonModule {}
