import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ContentMetadata } from './entities/content-metadata.entity';
import { Content } from '../contents/content.entity';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import { ContentsModule } from '../contents/contents.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { EmbeddingService } from './embedding.service';
import { IntentAnalyzerService } from './intent-analyzer';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentMetadata, Content, Watchlist, Review, User]),
    ConfigModule,
    ContentsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, EmbeddingService, IntentAnalyzerService],
  exports: [EmbeddingService],
})
export class ChatModule {}
