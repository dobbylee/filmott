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

    // 2. content_metadata가 비어있으면 임베딩 검색 스킵
    const hasMetadata = await this.embeddingService.hasAnyMetadata();
    const similarContents = hasMetadata
      ? await this.embeddingService.searchSimilar(
          content,
          15,
          userContext.watchedTmdbIds,
        )
      : [];

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

    // 5. GPT 스트리밍 호출 (function calling 없이 텍스트만)
    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    let fullText = '';

    // 6. 스트리밍 이벤트 처리
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) {
          stream.controller.abort();
          return;
        }

        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          emit('text', { content: delta });
        }
      }
    } catch (error) {
      if (signal?.aborted) return;
      throw error;
    }

    // 7. 텍스트에서 볼드(**제목**) 패턴으로 추천 작품 추출 → TMDB 검색 → 카드 생성
    const titles = this.extractTitlesFromText(fullText);
    if (titles.length > 0) {
      const recommendations = await this.resolveRecommendations(
        titles.map((t) => ({
          tmdbId: 0,
          contentType: 'movie' as const,
          title: t.korean,
          englishTitle: t.english,
        })),
        similarContents,
      );
      if (recommendations.length > 0) {
        emit('recommendations', { recommendations });
      }
    }

    emit('done', {});
  }

  extractTitlesFromText(text: string): { korean: string; english: string | null }[] {
    // **한국어 제목 (영어 원제)** 또는 **제목** 패턴에서 추출
    const boldPattern = /\*\*(.+?)\*\*/g;
    const results: { korean: string; english: string | null }[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = boldPattern.exec(text)) !== null) {
      const raw = match[1].trim();
      if (raw.length < 2 || raw.length > 100) continue;

      // "한국어 제목 (English Title)" 패턴 분리
      const parenMatch = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      const korean = parenMatch ? parenMatch[1].trim() : raw;
      const english = parenMatch ? parenMatch[2].trim() : null;

      if (!seen.has(korean)) {
        seen.add(korean);
        results.push({ korean, english });
      }
    }

    return results.slice(0, 5);
  }

  async resolveRecommendations(
    parsed: { tmdbId: number; contentType: 'movie' | 'tv'; title?: string; englishTitle?: string | null }[],
    candidates: SimilarContent[],
  ): Promise<ChatRecommendation[]> {
    const settled = await Promise.allSettled(
      parsed.map((rec) => this.resolveRecommendation(rec, candidates)),
    );

    return settled
      .filter(
        (r): r is PromiseFulfilledResult<ChatRecommendation | null> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value)
      .filter((r): r is ChatRecommendation => r !== null);
  }

  private async resolveRecommendation(
    rec: { tmdbId: number; contentType: 'movie' | 'tv'; title?: string; englishTitle?: string | null },
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

    // 3. tmdbId가 0이거나 TMDB 조회 실패 → 제목으로 TMDB 검색 fallback (movie + tv 둘 다 검색)
    if (rec.title) {
      try {
        const [movieResult, tvResult] = await Promise.all([
          this.contentsService.searchContents(rec.title, 'movie', 1).catch(() => null),
          this.contentsService.searchContents(rec.title, 'tv', 1).catch(() => null),
        ]);

        // movie + tv 결과를 합쳐서 제목 정확도 + 인기순으로 정렬
        const allResults = [
          ...(movieResult?.results?.map((r) => ({ ...r, type: 'movie' as const })) ?? []),
          ...(tvResult?.results?.map((r) => ({ ...r, type: 'tv' as const })) ?? []),
        ];

        const searchTitle = rec.title.toLowerCase();
        const searchEnglish = rec.englishTitle?.toLowerCase();

        const bestMatch = allResults
          .sort((a, b) => {
            const aTitle = (a.title ?? a.name ?? '').toLowerCase();
            const bTitle = (b.title ?? b.name ?? '').toLowerCase();
            const aOriginal = (a.original_title ?? a.original_name ?? '').toLowerCase();
            const bOriginal = (b.original_title ?? b.original_name ?? '').toLowerCase();

            // 정확 일치 우선 (한국어 또는 영어)
            const aExact = aTitle === searchTitle || aOriginal === searchTitle
              || (searchEnglish && (aOriginal === searchEnglish || aTitle === searchEnglish));
            const bExact = bTitle === searchTitle || bOriginal === searchTitle
              || (searchEnglish && (bOriginal === searchEnglish || bTitle === searchEnglish));
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;

            // 그 다음 vote_count 순
            return (b.vote_count ?? 0) - (a.vote_count ?? 0);
          })[0];

        if (bestMatch?.id) {
          const content = await this.contentsService.findOrFetchByTmdbId(
            bestMatch.id,
            bestMatch.type,
          );
          this.embeddingService.cacheContentMetadata(content.id).catch(() => {});
          return {
            tmdbId: content.tmdbId,
            contentType: bestMatch.type,
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
