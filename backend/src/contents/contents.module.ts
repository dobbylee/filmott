import { ContentDiscoveryService } from './services/content-discovery.service';
import { AdultContentService } from './services/adult-content.service';
import { ContentCatalogService } from './services/content-catalog.service';
import { ContentIndexingService } from './services/content-indexing.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './content.entity';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { TmdbModule } from '../tmdb/tmdb.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Content]), TmdbModule, CommonModule],
  controllers: [ContentsController],
  providers: [
    ContentDiscoveryService,
    AdultContentService,
    ContentsService,
    ContentIndexingService,
    ContentCatalogService,
  ],
  exports: [ContentDiscoveryService, ContentsService, ContentCatalogService],
})
export class ContentsModule {}
