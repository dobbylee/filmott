import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAIModule } from '../integrations/openai/openai.module';
import { Content } from '../contents/content.entity';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import { ContentsModule } from '../contents/contents.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { IntentAnalyzerService } from './intent-analyzer';
import { ContentSearchService } from './content-search.service';
import { ChatContextService } from './chat-context.service';
import { RecommendationCandidateService } from './recommendation-candidate.service';
import { ChatResponseStreamService } from './chat-response-stream.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content, Watchlist, Review, User]),
    OpenAIModule,
    ContentsModule,
    EmbeddingModule,
    RecommendationModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    IntentAnalyzerService,
    ContentSearchService,
    ChatContextService,
    RecommendationCandidateService,
    ChatResponseStreamService,
  ],
})
export class ChatModule {}
