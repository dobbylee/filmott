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
import { Content } from '../contents/content.entity';
import { TmdbService } from '../tmdb/tmdb.service';
import {
  buildSystemPrompt,
  UserContext,
  FavoriteContent,
  GenreStat,
  WantToWatchContent,
} from './prompts/system-prompt';
import { OTT_PROVIDERS } from '../common/ott-providers';
import { searchTmdbTool, recommendMoviesTool } from './tools/recommend-tool';

export interface SessionListItem {
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
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly tmdbService: TmdbService,
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
    const userMessage = await this.messageRepo.save(
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

    // 4. userContext + subscribedOtts + chatHistory 수집 (에러 시 사용자 메시지 삭제)
    try {
    const [userContext, user, chatHistory] = await Promise.all([
      this.buildUserContext(userId),
      this.userRepo.findOne({ where: { id: userId }, select: ['id', 'subscribedOtts'] }),
      this.getChatHistory(sessionId),
    ]);

    const subscribedOtts = user?.subscribedOtts ?? [];
    const systemPrompt = buildSystemPrompt(userContext, subscribedOtts, OTT_PROVIDERS);

    // 5. Anthropic SDK — tool use 루프
    const formattedHistory: Anthropic.MessageParam[] = chatHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const tools = [searchTmdbTool, recommendMoviesTool];
    const watchedSet = new Set(userContext.watchedTmdbIds);
    let fullText = '';
    let enrichedRecs: (ChatRecommendation & { posterUrl: string | null })[] = [];
    let messages = [...formattedHistory];
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = this.anthropic.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools,
      });

      // 텍스트 스트리밍
      stream.on('text', (textDelta) => {
        fullText += textDelta;
        emit('text', { content: textDelta });
      });

      const response = await stream.finalMessage();

      // stop_reason이 end_turn이면 루프 종료
      if (response.stop_reason === 'end_turn') {
        break;
      }

      // tool_use 처리
      if (response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.MessageParam[] = [];
        const assistantContent: Anthropic.ContentBlock[] = response.content;

        for (const block of assistantContent) {
          if (block.type === 'tool_use') {
            if (block.name === 'search_tmdb') {
              // TMDB 검색 실행
              const input = block.input as {
                query?: string;
                type: 'movie' | 'tv';
                genre_id?: number;
                year?: number;
                page?: number;
              };
              try {
                const searchResult = await this.executeTmdbSearch(input);
                toolResults.push({
                  role: 'user',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify(searchResult),
                  }],
                });
              } catch {
                toolResults.push({
                  role: 'user',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: '검색에 실패했습니다.',
                    is_error: true,
                  }],
                });
              }
            } else if (block.name === 'recommend_movies') {
              // 추천 결과 처리 — 시청한 작품 제외 + posterUrl 보강
              const input = block.input as { recommendations: ChatRecommendation[] };
              const filtered = input.recommendations.filter((rec) => !watchedSet.has(rec.tmdbId));

              enrichedRecs = await Promise.all(
                filtered.map(async (rec) => {
                  const content = await this.contentRepo.findOne({
                    where: { tmdbId: rec.tmdbId, contentType: rec.contentType },
                    select: ['posterUrl', 'title'],
                  });
                  if (content) {
                    return { ...rec, title: content.title || rec.title, posterUrl: content.posterUrl ?? null };
                  }
                  try {
                    const tmdbData = await this.tmdbService.getDetails(rec.tmdbId, rec.contentType);
                    const title = tmdbData.title || tmdbData.name || rec.title;
                    return { ...rec, title, posterUrl: tmdbData.poster_path ?? null };
                  } catch {
                    return { ...rec, posterUrl: null };
                  }
                }),
              );
              emit('recommendations', { recommendations: enrichedRecs });

              // recommend_movies는 최종 결과이므로 tool_result를 보내고 루프 종료
              toolResults.push({
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: '추천이 완료되었습니다.',
                }],
              });
            }
          }
        }

        // 대화에 assistant 응답 + tool results 추가
        messages = [
          ...messages,
          { role: 'assistant', content: assistantContent },
          ...toolResults,
        ];

        // recommend_movies가 호출되었으면 루프 종료
        if (enrichedRecs.length > 0) {
          break;
        }
      }
    }

    // 9. AI 응답 DB 저장 (텍스트 또는 추천이 있을 때만)
    if (fullText || enrichedRecs.length > 0) {
      const assistantMessage = await this.messageRepo.save(
        this.messageRepo.create({
          sessionId,
          role: 'assistant',
          content: fullText || '',
          recommendations: enrichedRecs.length > 0 ? enrichedRecs : null,
        }),
      );

      // 10. 세션 updatedAt 갱신
      await this.sessionRepo.update(sessionId, { updatedAt: new Date() });

      emit('done', { messageId: assistantMessage.id });
    } else {
      emit('done', { messageId: 0 });
    }
    } catch (error) {
      // API 호출 실패 시 사용자 메시지 삭제 (고아 메시지 방지)
      await this.messageRepo.delete(userMessage.id);
      throw error;
    }
  }

  private async executeTmdbSearch(input: {
    query?: string;
    type: 'movie' | 'tv';
    genre_id?: number;
    year?: number;
    page?: number;
  }): Promise<{ results: { id: number; title: string; overview: string; release_date: string; vote_average: number; vote_count: number; genre_ids: number[] }[] }> {
    if (input.query) {
      // 제목 검색
      const result = await this.tmdbService.searchByType(input.query, input.type, input.page ?? 1);
      return {
        results: result.results.slice(0, 10).map((r) => ({
          id: r.id,
          title: r.title || r.name || '',
          overview: (r.overview || '').slice(0, 100),
          release_date: r.release_date || r.first_air_date || '',
          vote_average: r.vote_average ?? 0,
          vote_count: r.vote_count ?? 0,
          genre_ids: r.genre_ids ?? [],
        })),
      };
    }
    // 장르 기반 디스커버 검색 (인기 있는 작품 + 성인물 제외)
    const result = await this.tmdbService.discoverByFilters(input.type, {
      genres: input.genre_id?.toString(),
      year: input.year,
      page: input.page ?? 1,
      sort: 'popularity.desc',
      region: 'KR',
    });
    // vote_count 200 미만 제외 (잘 알려지지 않은 작품 필터링 강화)
    const MIN_VOTES_FOR_RECOMMEND = 200;
    return {
      results: result.results
        .filter((r) => (r.vote_count ?? 0) >= MIN_VOTES_FOR_RECOMMEND)
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          title: r.title || r.name || '',
          overview: (r.overview || '').slice(0, 100),
          release_date: r.release_date || r.first_air_date || '',
          vote_average: r.vote_average ?? 0,
          vote_count: r.vote_count ?? 0,
          genre_ids: r.genre_ids ?? [],
        })),
    };
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
