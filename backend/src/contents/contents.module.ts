import { PersonCatalogService } from './services/person-catalog.service';
import { ContentDiscoveryService } from './services/content-discovery.service';
import { AdultContentService } from './services/adult-content.service';
import { ContentCatalogService } from './services/content-catalog.service';
import { ContentIndexingService } from './services/content-indexing.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './content.entity';
import { ContentsController } from './contents.controller';
import { TmdbModule } from '../tmdb/tmdb.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Content]), TmdbModule, CommonModule],
  controllers: [ContentsController],
  providers: [
    PersonCatalogService,
    ContentDiscoveryService,
    AdultContentService,
    ContentIndexingService,
    ContentCatalogService,
  ],
  exports: [ContentDiscoveryService, ContentCatalogService],
})
export class ContentsModule {}
