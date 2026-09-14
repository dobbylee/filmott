import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAIModule } from '../integrations/openai/openai.module';
import { Content } from '../contents/content.entity';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { IntentAnalyzerService } from './intent-analyzer';
import { ChatContextService } from './chat-context.service';
import { ChatResponseStreamService } from './chat-response-stream.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content, Watchlist, Review, User]),
    OpenAIModule,
    RecommendationModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    IntentAnalyzerService,
    ChatContextService,
    ChatResponseStreamService,
  ],
})
export class ChatModule {}
