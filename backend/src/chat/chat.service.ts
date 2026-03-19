import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage, ChatRecommendation } from './entities/chat-message.entity';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import {
  buildSystemPrompt,
  UserContext,
  FavoriteContent,
  GenreStat,
  WantToWatchContent,
} from './prompts/system-prompt';
import { OTT_PROVIDERS } from '../common/ott-providers';
import { recommendMoviesTool } from './tools/recommend-tool';

interface SessionListItem {
  id: number;
  title: string | null;
  updatedAt: Date;
  lastMessage: string | null;
}

interface RawFavoriteRow {
  title: string;
  releaseDate: string | null;
  genres: string;
  rating: number;
}

interface RawGenreStatRow {
  genre: string;
  avgRating: string;
  count: string;
}

interface RawWantToWatchRow {
  title: string;
  releaseDate: string | null;
}

interface RawWatchedTmdbIdRow {
  tmdbId: number;
}

type SseEmitter = (event: string, data: unknown) => void;

@Injectable()
export class ChatService {
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(Watchlist)
    private readonly watchlistRepo: Repository<Watchlist>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY', ''),
    });
  }

  private static readonly MAX_SESSIONS_PER_USER = 50;

  async createSession(userId: number): Promise<{ id: number; title: string | null; createdAt: Date }> {
    // 사용자당 최대 세션 수 제한 — 초과 시 가장 오래된 세션 삭제
    await this.cleanupOldSessions(userId);

    const session = this.sessionRepo.create({ userId, title: null });
    const saved = await this.sessionRepo.save(session);
    return { id: saved.id, title: saved.title, createdAt: saved.createdAt };
  }

  private async cleanupOldSessions(userId: number): Promise<void> {
    const count = await this.sessionRepo.count({ where: { userId } });
    if (count < ChatService.MAX_SESSIONS_PER_USER) return;

    const excess = count - ChatService.MAX_SESSIONS_PER_USER + 1; // +1: 새 세션 공간 확보
    const oldest = await this.sessionRepo.find({
      where: { userId },
      order: { updatedAt: 'ASC' },
      take: excess,
      select: ['id'],
    });

    if (oldest.length > 0) {
      const ids = oldest.map((s) => s.id);
      await this.sessionRepo.delete(ids);
    }
  }

  async getSessions(userId: number): Promise<SessionListItem[]> {
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .select(['s.id', 's.title', 's.updatedAt'])
      .where('s.userId = :userId', { userId })
      .orderBy('s.updatedAt', 'DESC')
      .limit(50)
      .getMany();

    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) return [];

    // 각 세션의 마지막 메시지를 가져옴
    const lastMessages = await this.messageRepo
      .createQueryBuilder('m')
      .select(['m.sessionId', 'm.content'])
      .where('m.sessionId IN (:...sessionIds)', { sessionIds })
      .andWhere('m.id IN (SELECT MAX(sub.id) FROM chat_messages sub WHERE sub.session_id IN (:...sessionIds) GROUP BY sub.session_id)', { sessionIds })
      .getMany();

    const lastMessageMap = new Map<number, string>();
    for (const msg of lastMessages) {
      lastMessageMap.set(msg.sessionId, msg.content);
    }

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      lastMessage: lastMessageMap.get(s.id) ?? null,
    }));
  }

  async getMessages(userId: number, sessionId: number): Promise<ChatMessage[]> {
    await this.verifySessionOwner(userId, sessionId);

    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteSession(userId: number, sessionId: number): Promise<void> {
    await this.verifySessionOwner(userId, sessionId);
    await this.sessionRepo.delete({ id: sessionId });
  }

  async sendMessageStream(
    userId: number,
    sessionId: number,
    content: string,
    emit: SseEmitter,
  ): Promise<void> {
    // 0. API key 검증
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY', '');
    if (!apiKey) {
      throw new BadRequestException('AI 추천 기능이 현재 비활성화 상태입니다.');
    }

    // 1. 세션 소유자 검증
    await this.verifySessionOwner(userId, sessionId);

    // 2. 사용자 메시지 DB 저장
    await this.messageRepo.save(
      this.messageRepo.create({
        sessionId,
        role: 'user',
        content,
      }),
    );

    // 3. 첫 메시지인 경우 세션 title 자동 생성
    const messageCount = await this.messageRepo.count({ where: { sessionId } });
    if (messageCount === 1) {
      const title = content.length > 30 ? content.substring(0, 30) + '...' : content;
      await this.sessionRepo.update(sessionId, { title });
    }

    // 4. userContext + subscribedOtts + chatHistory 수집
    const [userContext, user, chatHistory] = await Promise.all([
      this.buildUserContext(userId),
      this.userRepo.findOne({ where: { id: userId }, select: ['id', 'subscribedOtts'] }),
      this.getChatHistory(sessionId),
    ]);

    const subscribedOtts = user?.subscribedOtts ?? [];
    const systemPrompt = buildSystemPrompt(userContext, subscribedOtts, OTT_PROVIDERS);

    // 5. Anthropic SDK 스트리밍 호출
    const formattedHistory: Anthropic.MessageParam[] = chatHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const stream = this.anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: formattedHistory,
      tools: [recommendMoviesTool],
    });

    let fullText = '';
    let recommendations: ChatRecommendation[] | null = null;

    // 6. 스트리밍 이벤트 처리
    stream.on('text', (textDelta) => {
      fullText += textDelta;
      emit('text', { content: textDelta });
    });

    // 7. 스트림 완료 대기
    const finalMessage = await stream.finalMessage();

    // 8. tool_use 결과 추출
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use' && block.name === 'recommend_movies') {
        const input = block.input as { recommendations: ChatRecommendation[] };
        recommendations = input.recommendations;
        emit('recommendations', { recommendations });
      }
    }

    // 9. AI 응답 DB 저장
    const assistantMessage = await this.messageRepo.save(
      this.messageRepo.create({
        sessionId,
        role: 'assistant',
        content: fullText || '(추천 도구를 사용했습니다)',
        recommendations,
      }),
    );

    // 10. 세션 updatedAt 갱신
    await this.sessionRepo.update(sessionId, { updatedAt: new Date() });

    emit('done', { messageId: assistantMessage.id });
  }

  async buildUserContext(userId: number): Promise<UserContext> {
    const [favorites, disliked, genreStats, watchedTmdbIds, wantToWatch] = await Promise.all([
      this.getFavorites(userId),
      this.getDisliked(userId),
      this.getGenreStats(userId),
      this.getWatchedTmdbIds(userId),
      this.getWantToWatch(userId),
    ]);

    return { favorites, disliked, genreStats, watchedTmdbIds, wantToWatch };
  }

  private async getFavorites(userId: number): Promise<FavoriteContent[]> {
    const rows: RawFavoriteRow[] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.content', 'c')
      .select([
        'c.title AS "title"',
        'c.release_date AS "releaseDate"',
        "array_to_string(ARRAY(SELECT jsonb_array_elements(c.genres) ->> 'name'), ', ') AS \"genres\"",
        'r.rating AS "rating"',
      ])
      .where('r.userId = :userId', { userId })
      .andWhere('r.rating >= 8')
      .orderBy('r.rating', 'DESC')
      .addOrderBy('r.updatedAt', 'DESC')
      .limit(20)
      .getRawMany();

    return rows.map((row) => ({
      title: row.title,
      year: row.releaseDate ? new Date(row.releaseDate).getFullYear().toString() : '',
      genres: row.genres || '',
      rating: row.rating,
    }));
  }

  private async getDisliked(userId: number): Promise<FavoriteContent[]> {
    const rows: RawFavoriteRow[] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.content', 'c')
      .select([
        'c.title AS "title"',
        'c.release_date AS "releaseDate"',
        "array_to_string(ARRAY(SELECT jsonb_array_elements(c.genres) ->> 'name'), ', ') AS \"genres\"",
        'r.rating AS "rating"',
      ])
      .where('r.userId = :userId', { userId })
      .andWhere('r.rating <= 4')
      .orderBy('r.rating', 'ASC')
      .addOrderBy('r.updatedAt', 'DESC')
      .limit(10)
      .getRawMany();

    return rows.map((row) => ({
      title: row.title,
      year: row.releaseDate ? new Date(row.releaseDate).getFullYear().toString() : '',
      genres: row.genres || '',
      rating: row.rating,
    }));
  }

  private async getGenreStats(userId: number): Promise<GenreStat[]> {
    const rows: RawGenreStatRow[] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.content', 'c')
      .select([
        "jsonb_array_elements(c.genres) ->> 'name' AS \"genre\"",
        'ROUND(AVG(r.rating), 1) AS "avgRating"',
        'COUNT(*) AS "count"',
      ])
      .where('r.userId = :userId', { userId })
      .andWhere('r.rating IS NOT NULL')
      .groupBy('"genre"')
      .orderBy('"count"', 'DESC')
      .getRawMany();

    return rows.map((row) => ({
      genre: row.genre,
      avgRating: row.avgRating,
      count: parseInt(row.count, 10),
    }));
  }

  private async getWatchedTmdbIds(userId: number): Promise<number[]> {
    const rows: RawWatchedTmdbIdRow[] = await this.watchlistRepo
      .createQueryBuilder('w')
      .innerJoin('w.content', 'c')
      .select('c.tmdb_id AS "tmdbId"')
      .where('w.userId = :userId', { userId })
      .andWhere("w.status = 'watched'")
      .getRawMany();

    return rows.map((row) => row.tmdbId);
  }

  private async getWantToWatch(userId: number): Promise<WantToWatchContent[]> {
    const rows: RawWantToWatchRow[] = await this.watchlistRepo
      .createQueryBuilder('w')
      .innerJoin('w.content', 'c')
      .select([
        'c.title AS "title"',
        'c.release_date AS "releaseDate"',
      ])
      .where('w.userId = :userId', { userId })
      .andWhere("w.status = 'want_to_watch'")
      .orderBy('w.createdAt', 'DESC')
      .limit(20)
      .getRawMany();

    return rows.map((row) => ({
      title: row.title,
      year: row.releaseDate ? new Date(row.releaseDate).getFullYear().toString() : '',
    }));
  }

  private async getChatHistory(sessionId: number): Promise<ChatMessage[]> {
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
      take: 20,
    });
  }

  private async verifySessionOwner(userId: number, sessionId: number): Promise<ChatSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('세션을 찾을 수 없습니다.');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('이 세션에 접근할 권한이 없습니다.');
    }
    return session;
  }
}
