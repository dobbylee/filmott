import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingService, SimilarContent } from './embedding.service';
import { ContentSearchService, ContentSearchFilters } from './content-search.service';
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
import { IntentAnalyzerService, ParsedIntent } from './intent-analyzer';
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
  private readonly logger = new Logger(ChatService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly contentSearchService: ContentSearchService,
    private readonly contentsService: ContentsService,
    private readonly intentAnalyzer: IntentAnalyzerService,
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

    // 2. 대화 맥락을 합쳐서 벡터 검색 (전체 user 메시지 + 현재 메시지)
    const hasMetadata = await this.embeddingService.hasAnyMetadata();
    let similarContents: SimilarContent[] = [];
    let intent: ParsedIntent = {
      ottProviderNames: [],
      countries: [],
      personNames: [],
      dateRange: null,
      contentType: null,
      genres: [],
    };

    if (hasMetadata) {
      const userMessages = (history || [])
        .filter((msg) => msg.role === 'user')
        .map((msg) => msg.content);
      userMessages.push(content);
      const searchQuery = userMessages.join(' ');

      // 3. LLM 의도 분석 → 현재 메시지만 사용 (히스토리 포함 시 이전 맥락과 혼동)
      intent = await this.intentAnalyzer.analyzeIntent(content);

      // 4. ParsedIntent → ContentSearchFilters 변환
      const filters = this.buildFiltersFromIntent(intent);
      const hasFilters = Object.keys(filters).length > 0;

      // 5. 쿼리 정제: 메타데이터 키워드 제거 후 의미적 쿼리만 사용
      const semanticQuery = this.intentAnalyzer.buildSemanticQuery(searchQuery, intent);

      // 6. 분기: 필터 유무에 따라 SQL 전체 검색 / 기존 벡터 검색
      if (hasFilters) {
        similarContents = await this.contentSearchService.searchWithFilters(
          semanticQuery, 20, userContext.watchedTmdbIds, filters,
        );
      } else {
        similarContents = await this.embeddingService.searchSimilar(
          semanticQuery, 20, userContext.watchedTmdbIds,
        );
      }
    }

    // 7. 시스템 프롬프트 구성 (검색 결과 + 필터 맥락 포함)
    const systemPrompt = buildSystemPrompt(
      userContext,
      subscribedOtts,
      OTT_PROVIDERS,
      similarContents,
      intent,
    );

    // 8. 대화 이력 구성
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(history || []).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content },
    ];

    // 9. GPT 스트리밍 호출 (function calling 없이 텍스트만)
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

    // 10. 스트리밍 이벤트 처리
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

    // 11. 볼드 제목 추출 → 후보 내 매칭(카드) + 후보 외(비동기 캐싱만)
    const titles = this.extractTitlesFromText(fullText);
    if (titles.length > 0) {
      const { matched, unmatched } = this.matchTitlesToCandidates(titles, similarContents);

      if (matched.length > 0) {
        emit('recommendations', { recommendations: matched });
      }

      // 후보 외 작품은 비동기로 TMDB 검색 + 캐싱 (카드 미표시, await 안 함)
      if (unmatched.length > 0) {
        this.cacheUnmatchedTitles(unmatched).catch(() => {});
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
      if (raw.length < 3 || raw.length > 100) continue;

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

  matchTitlesToCandidates(
    titles: { korean: string; english: string | null }[],
    candidates: SimilarContent[],
  ): { matched: ChatRecommendation[]; unmatched: { korean: string; english: string | null }[] } {
    const matched: ChatRecommendation[] = [];
    const unmatched: { korean: string; english: string | null }[] = [];

    for (const title of titles) {
      const korean = title.korean.toLowerCase();
      const english = title.english?.toLowerCase();

      // 1차: 정확 일치
      let candidate = candidates.find((c) => {
        const cTitle = c.title.toLowerCase();
        return cTitle === korean || (english && cTitle === english);
      });

      // 2차: 포함 관계 (예: "오징어 게임" ↔ "오징어 게임: 시즌 2")
      if (!candidate) {
        candidate = candidates.find((c) => {
          const cTitle = c.title.toLowerCase();
          return cTitle.includes(korean) || korean.includes(cTitle)
            || (english && (cTitle.includes(english) || english.includes(cTitle)));
        });
      }

      if (candidate) {
        matched.push({
          tmdbId: candidate.tmdbId,
          contentType: candidate.contentType as 'movie' | 'tv',
          title: candidate.title,
          posterUrl: candidate.posterUrl,
        });
      } else {
        unmatched.push(title);
      }
    }

    return { matched, unmatched };
  }

  private async cacheUnmatchedTitles(
    titles: { korean: string; english: string | null }[],
  ): Promise<void> {
    for (const title of titles) {
      try {
        const searchQuery = title.english || title.korean;
        const [movieResult, tvResult] = await Promise.all([
          this.contentsService.searchContents(searchQuery, 'movie', 1).catch(() => null),
          this.contentsService.searchContents(searchQuery, 'tv', 1).catch(() => null),
        ]);

        const firstMatch =
          (movieResult?.results?.[0] ? { id: movieResult.results[0].id, type: 'movie' as const } : null)
          ?? (tvResult?.results?.[0] ? { id: tvResult.results[0].id, type: 'tv' as const } : null);

        if (firstMatch) {
          const content = await this.contentsService.findOrFetchByTmdbId(
            firstMatch.id,
            firstMatch.type,
          );
          this.embeddingService.cacheContentMetadata(content.id).catch(() => {});
        }
      } catch (error) {
        this.logger.warn(
          `unmatched 제목 캐싱 실패 ("${title.korean}"): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
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

  private buildFiltersFromIntent(intent: ParsedIntent): ContentSearchFilters {
    const filters: ContentSearchFilters = {};
    if (intent.ottProviderNames.length > 0) filters.ottProviderNames = intent.ottProviderNames;
    if (intent.countries.length > 0) filters.countries = intent.countries;
    if (intent.personNames.length > 0) filters.personNames = intent.personNames;
    if (intent.dateRange && (intent.dateRange.from || intent.dateRange.to)) {
      filters.dateRange = intent.dateRange;
    }
    if (intent.contentType) filters.contentType = intent.contentType;
    if (intent.genres.length > 0) filters.genres = intent.genres;
    return filters;
  }
}
