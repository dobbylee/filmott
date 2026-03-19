import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingService, SimilarContent } from './embedding.service';
import { Watchlist } from '../watchlist/watchlist.entity';
import { Review } from '../reviews/review.entity';
import { User } from '../users/user.entity';
import { Content } from '../contents/content.entity';
import {
  buildSystemPrompt,
  UserContext,
  FavoriteContent,
  GenreStat,
  WantToWatchContent,
} from './prompts/system-prompt';
import { OTT_PROVIDERS } from '../common/ott-providers';
import { ContentsService } from '../contents/contents.service';
import { ChatHistoryMessageDto } from './dto/send-message.dto';

export interface ChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
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
  private readonly openai: OpenAI | null;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly contentsService: ContentsService,
    @InjectRepository(Watchlist)
    private readonly watchlistRepo: Repository<Watchlist>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openai = apiKey
      ? new OpenAI({ apiKey })
      : null;
  }

  async sendMessageStream(
    userId: number,
    content: string,
    history: ChatHistoryMessageDto[],
    emit: SseEmitter,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.openai) {
      throw new BadRequestException('AI 추천 기능이 현재 비활성화 상태입니다.');
    }

    // 1. 사용자 컨텍스트 수집 + OTT 구독 정보
    const [userContext, user] = await Promise.all([
      this.buildUserContext(userId),
      this.userRepo.findOne({ where: { id: userId }, select: ['id', 'subscribedOtts'] }),
    ]);

    const subscribedOtts = user?.subscribedOtts ?? [];

    // 2. 사용자 입력을 임베딩으로 변환 + 유사 작품 검색
    const similarContents = await this.embeddingService.searchSimilar(
      content,
      15,
      userContext.watchedTmdbIds,
    );

    // 3. 시스템 프롬프트 구성 (검색 결과 포함)
    const systemPrompt = buildSystemPrompt(
      userContext,
      subscribedOtts,
      OTT_PROVIDERS,
      similarContents,
    );

    // 4. 대화 이력 구성
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(history || []).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content },
    ];

    // 5. GPT 스트리밍 호출
    const stream = await this.openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 4096,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    let fullText = '';
    let reachedMarker = false;
    let markerBuffer = '';

    // 6. 스트리밍 이벤트 처리
    try {
      for await (const chunk of stream) {
        // SSE 연결 끊김 시 스트림 중단
        if (signal?.aborted) {
          stream.controller.abort();
          return;
        }

        const delta = chunk.choices[0]?.delta?.content;
        if (!delta) continue;

        if (reachedMarker) {
          markerBuffer += delta;
          continue;
        }

        // ---RECOMMENDATIONS--- 마커 감지
        const combined = fullText + delta;
        const markerIndex = combined.indexOf('---RECOMMENDATIONS---');

        if (markerIndex !== -1) {
          reachedMarker = true;
          // 마커 이전 텍스트만 emit
          const beforeMarker = combined.substring(fullText.length, markerIndex);
          if (beforeMarker) {
            emit('text', { content: beforeMarker });
          }
          // 마커 이후 텍스트를 버퍼에 추가
          markerBuffer = combined.substring(markerIndex);
          fullText = combined;
          continue;
        }

        fullText += delta;
        emit('text', { content: delta });
      }
    } catch (error) {
      // AbortError는 정상적인 연결 종료이므로 무시
      if (signal?.aborted) return;
      throw error;
    }

    // 7. 응답에서 추천 작품 추출
    const completeText = fullText + (reachedMarker ? '' : '');
    const completeBuffer = reachedMarker ? markerBuffer : '';
    const recommendations = await this.extractRecommendations(
      completeBuffer || completeText,
      similarContents,
    );

    if (recommendations.length > 0) {
      emit('recommendations', { recommendations });
    }

    emit('done', {});
  }

  async extractRecommendations(
    text: string,
    candidates: SimilarContent[],
  ): Promise<ChatRecommendation[]> {
    const markerStart = text.indexOf('---RECOMMENDATIONS---');
    const markerEnd = text.indexOf('---END---');

    if (markerStart === -1 || markerEnd === -1) return [];

    const jsonStr = text.substring(
      markerStart + '---RECOMMENDATIONS---'.length,
      markerEnd,
    ).trim();

    try {
      const parsed: { tmdbId: number; contentType: 'movie' | 'tv'; title?: string }[] = JSON.parse(jsonStr);

      // 병렬 처리: 각 추천 항목을 동시에 처리
      const settled = await Promise.allSettled(
        parsed.map((rec) => this.resolveRecommendation(rec, candidates)),
      );

      const results: ChatRecommendation[] = [];
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  private async resolveRecommendation(
    rec: { tmdbId: number; contentType: 'movie' | 'tv'; title?: string },
    candidates: SimilarContent[],
  ): Promise<ChatRecommendation | null> {
    // 1. 벡터 검색 후보에서 찾기
    const candidate = candidates.find((c) => c.tmdbId === rec.tmdbId);
    if (candidate) {
      return {
        tmdbId: rec.tmdbId,
        contentType: rec.contentType,
        title: candidate.title,
        posterUrl: candidate.posterUrl,
      };
    }

    // 2. 후보에 없는 작품 → TMDB에서 조회 + DB 저장
    if (rec.tmdbId && rec.tmdbId > 0) {
      try {
        const content = await this.contentsService.findOrFetchByTmdbId(
          rec.tmdbId,
          rec.contentType,
        );
        // 비동기 임베딩 캐싱 (await 하지 않음)
        this.embeddingService.cacheContentMetadata(content.id).catch(() => {});
        return {
          tmdbId: rec.tmdbId,
          contentType: rec.contentType,
          title: content.title,
          posterUrl: content.posterUrl ?? null,
        };
      } catch {
        // TMDB ID 조회 실패 → 제목으로 fallback 검색
      }
    }

    // 3. tmdbId가 0이거나 TMDB 조회 실패 → 제목으로 TMDB 검색 fallback
    if (rec.title) {
      try {
        const searchResult = await this.contentsService.searchContents(
          rec.title,
          rec.contentType,
          1,
        );
        const firstResult = searchResult.results?.[0];
        if (firstResult?.id) {
          const content = await this.contentsService.findOrFetchByTmdbId(
            firstResult.id,
            rec.contentType,
          );
          // 비동기 임베딩 캐싱 (await 하지 않음)
          this.embeddingService.cacheContentMetadata(content.id).catch(() => {});
          return {
            tmdbId: content.tmdbId,
            contentType: rec.contentType,
            title: content.title,
            posterUrl: content.posterUrl ?? null,
          };
        }
      } catch {
        // 검색도 실패 시 제목만으로 카드
      }

      return {
        tmdbId: rec.tmdbId || 0,
        contentType: rec.contentType,
        title: rec.title,
        posterUrl: null,
      };
    }

    return null;
  }

  async buildUserContext(userId: number): Promise<UserContext> {
    const [favorites, disliked, genreStats, watchedTmdbIds, wantToWatch] =
      await Promise.all([
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
      year: row.releaseDate
        ? new Date(row.releaseDate).getFullYear().toString()
        : '',
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
      year: row.releaseDate
        ? new Date(row.releaseDate).getFullYear().toString()
        : '',
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
      year: row.releaseDate
        ? new Date(row.releaseDate).getFullYear().toString()
        : '',
    }));
  }
}
