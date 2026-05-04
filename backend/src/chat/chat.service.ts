import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CHAT_MODEL } from './chat.constants';
import { EmbeddingService, SimilarContent } from './embedding.service';
import {
  ContentSearchService,
  ContentSearchFilters,
} from './content-search.service';
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
import {
  extractUserPreference,
  enrichQueryWithPreference,
} from './user-preference';
import { IntentAnalyzerService, ParsedIntent } from './intent-analyzer';
import { ContentsService } from '../contents/contents.service';
import { ChatHistoryMessageDto } from './dto/send-message.dto';
import {
  RECOMMENDATIONS_TRAILER_CLOSE,
  RECOMMENDATIONS_TRAILER_OPEN,
  ResolvedChatRecommendation,
  formatRecommendationVisibleLine,
  extractPreviouslyRecommendedTitles,
} from './structured-chat-response';

const OPENAI_CHAT_TIMEOUT_MS = 30_000;
const TRAILER_DETECTION_TAIL_LENGTH = RECOMMENDATIONS_TRAILER_OPEN.length - 1;

interface RawFavoriteRow {
  title: string;
  releaseDate: string | null;
  genres: string;
  rating: number;
  originCountry: string | null;
  director?: string | null;
}

interface RawGenreStatRow {
  genre: string;
  avgRating: string;
  count: string;
}

interface RawWantToWatchRow {
  title: string;
  releaseDate: string | null;
  genres: string;
  originCountry: string | null;
}

interface RawWatchedTmdbIdRow {
  tmdbId: number;
}

type SseEmitter = (event: string, data: unknown) => void;

interface StreamedChatResponse {
  visibleText: string;
  trailerText: string;
}

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
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async sendMessageStream(
    userId: number | null,
    content: string,
    history: ChatHistoryMessageDto[],
    emit: SseEmitter,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.openai) {
      throw new BadRequestException('AI 추천 기능이 현재 비활성화 상태입니다.');
    }

    // 1. 사용자 컨텍스트 수집 + OTT 구독 정보
    let userContext: UserContext;
    let subscribedOtts: string[];

    if (userId !== null) {
      const [ctx, user] = await Promise.all([
        this.buildUserContext(userId),
        this.userRepo.findOne({
          where: { id: userId },
          select: ['id', 'subscribedOtts'],
        }),
      ]);
      userContext = ctx;
      subscribedOtts = user?.subscribedOtts ?? [];
    } else {
      // 비로그인: 빈 컨텍스트 (개인화 없이 범용 추천)
      userContext = {
        favorites: [],
        disliked: [],
        genreStats: [],
        watchedTmdbIds: [],
        wantToWatch: [],
        watchedGenres: [],
      };
      subscribedOtts = [];
    }

    // 2. 대화 맥락을 합쳐서 벡터 검색 (전체 user 메시지 + 현재 메시지)
    const hasMetadata = await this.embeddingService.hasAnyMetadata();
    let similarContents: SimilarContent[] = [];
    let intent: ParsedIntent = {
      ottProviderNames: [],
      countries: [],
      excludeCountries: [],
      personNames: [],
      referenceTitles: [],
      dateRange: null,
      contentType: null,
      genres: [],
      confidence: 'low',
    };

    if (hasMetadata) {
      const userMessages = (history || [])
        .filter((msg) => msg.role === 'user')
        .map((msg) => msg.content);
      userMessages.push(content);
      const searchQuery = userMessages.join(' ');

      // 3. LLM 의도 분석 → 최근 대화 맥락 포함 (멀티턴)
      intent = await this.intentAnalyzer.analyzeIntent(content, history);

      // 4. ParsedIntent → ContentSearchFilters 변환
      const filters = this.buildFiltersFromIntent(intent);

      // 5. 쿼리 정제: 메타데이터 키워드 제거 후 의미적 쿼리만 사용
      const semanticQuery = this.intentAnalyzer.buildSemanticQuery(
        searchQuery,
        intent,
      );

      // 6. 참조 작품 임베딩 해결
      const referenceResult = await this.resolveReferenceEmbedding(
        intent.referenceTitles,
      );
      const referenceEmbedding = referenceResult?.embedding ?? null;
      const referenceExcludeTmdbIds = referenceResult?.tmdbId
        ? [...userContext.watchedTmdbIds, referenceResult.tmdbId]
        : userContext.watchedTmdbIds;

      // 7. 유저 선호 추출 + 2분기 검색
      const userPref = extractUserPreference(
        userContext,
        subscribedOtts,
        intent.personNames,
      );

      if (intent.confidence === 'high') {
        // 구체적 요청: SQL 필터 우선, 유저 선호는 명시적 필터가 없는 필드에만 합산
        const mergedFilters: ContentSearchFilters = { ...filters };

        if (
          !mergedFilters.ottProviderNames?.length &&
          userPref.ottProviderNames.length > 0
        ) {
          mergedFilters.ottProviderNames = userPref.ottProviderNames;
        }
        if (
          !mergedFilters.genres?.length &&
          userPref.preferredGenres.length > 0
        ) {
          mergedFilters.genres = userPref.preferredGenres;
        }
        if (
          !mergedFilters.countries?.length &&
          userPref.preferredCountries.length > 0
        ) {
          mergedFilters.countries = userPref.preferredCountries;
        }

        // 비선호 장르/감독 제외 (명시적 요청과 겹치지 않는 것만)
        if (userPref.excludeGenres.length > 0) {
          const effectiveExcludeGenres = userPref.excludeGenres.filter(
            (g) => !mergedFilters.genres?.includes(g),
          );
          if (effectiveExcludeGenres.length > 0) {
            mergedFilters.excludeGenres = effectiveExcludeGenres;
          }
        }
        if (userPref.excludePersonNames.length > 0) {
          const effectiveExcludePersons = userPref.excludePersonNames.filter(
            (p) => !mergedFilters.personNames?.includes(p),
          );
          if (effectiveExcludePersons.length > 0) {
            mergedFilters.excludePersonNames = effectiveExcludePersons;
          }
        }

        const enrichedQuery = enrichQueryWithPreference(
          semanticQuery,
          userPref,
          intent,
        );

        similarContents = await this.contentSearchService.searchWithFilters(
          enrichedQuery,
          20,
          referenceExcludeTmdbIds,
          mergedFilters,
          referenceEmbedding ?? undefined,
        );
      } else {
        // 모호한 요청 (confidence='low')
        if (userPref.hasData) {
          // 유저 선호 있음: intent 필터 스킵, 유저 선호만으로 검색
          const prefOnlyFilters: ContentSearchFilters = {};
          if (userPref.ottProviderNames.length > 0)
            prefOnlyFilters.ottProviderNames = userPref.ottProviderNames;
          if (userPref.preferredGenres.length > 0)
            prefOnlyFilters.genres = userPref.preferredGenres;
          if (userPref.preferredCountries.length > 0)
            prefOnlyFilters.countries = userPref.preferredCountries;
          if (userPref.excludeGenres.length > 0)
            prefOnlyFilters.excludeGenres = userPref.excludeGenres;
          if (userPref.excludePersonNames.length > 0)
            prefOnlyFilters.excludePersonNames = userPref.excludePersonNames;

          const enrichedQuery = enrichQueryWithPreference(
            semanticQuery,
            userPref,
            intent,
          );

          similarContents = await this.contentSearchService.searchWithFilters(
            enrichedQuery,
            20,
            referenceExcludeTmdbIds,
            prefOnlyFilters,
            referenceEmbedding ?? undefined,
          );
        } else {
          // 신규 유저: 벡터 유사도만
          similarContents = await this.embeddingService.searchSimilar(
            semanticQuery,
            20,
            referenceExcludeTmdbIds,
            undefined,
            referenceEmbedding ?? undefined,
          );
        }
      }
    }

    // 8. 이전 대화에서 추천한 작품 제목 추출
    const previouslyRecommended = extractPreviouslyRecommendedTitles(
      history || [],
    );

    // 9. 서버에서 최종 추천 후보 확정
    const confirmedRecommendationCandidates =
      this.selectConfirmedRecommendationCandidates(
        similarContents,
        intent.contentType,
        previouslyRecommended,
      );

    // 10. 시스템 프롬프트 구성 (확정 추천 후보 + 필터 맥락 포함)
    const systemPrompt = buildSystemPrompt(
      userContext,
      subscribedOtts,
      OTT_PROVIDERS,
      similarContents,
      intent,
      previouslyRecommended,
      confirmedRecommendationCandidates,
    );

    // 11. 대화 이력 구성
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(history || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user' as const, content },
    ];

    // 12. GPT 스트리밍 응답 호출
    const stream = await this.openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        reasoning_effort: 'low',
        max_completion_tokens: 4096,
        stream: true,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      },
      { timeout: OPENAI_CHAT_TIMEOUT_MS, signal },
    );

    if (signal?.aborted) {
      return;
    }

    await this.emitStreamingText(stream, emit, signal);

    if (signal?.aborted) {
      return;
    }

    const matched = this.toResolvedRecommendations(
      confirmedRecommendationCandidates,
    );

    if (matched.length > 0) {
      emit('recommendations', { recommendations: matched });
      this.cacheRecommendationMetadataInBackground(
        confirmedRecommendationCandidates,
      );
    }

    emit('done', {});
  }

  private async emitStreamingText(
    stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    emit: SseEmitter,
    signal?: AbortSignal,
  ): Promise<StreamedChatResponse> {
    let pendingText = '';
    let trailerText = '';
    let visibleTextBuffer = '';
    let visibleLineBuffer = '';
    let isCollectingTrailer = false;
    let hasEmittedText = false;

    const emitFormattedVisibleText = (text: string, flush = false): void => {
      visibleLineBuffer += text;
      const lines = visibleLineBuffer.split('\n');
      visibleLineBuffer = flush ? '' : (lines.pop() ?? '');
      const completedLines = flush ? lines : lines;

      for (let i = 0; i < completedLines.length; i += 1) {
        const isLastFlushedLine = flush && i === completedLines.length - 1;
        const line = completedLines[i];
        if (isLastFlushedLine && line === '') continue;

        const formatted = formatRecommendationVisibleLine(line);
        if (formatted === null) continue;
        if (!hasEmittedText && formatted.trim().length === 0) continue;

        const output = `${formatted}${isLastFlushedLine ? '' : '\n'}`;
        visibleTextBuffer += output;
        this.emitTextIfNotEmpty(output, emit);
        hasEmittedText = hasEmittedText || formatted.length > 0;
      }
    };

    for await (const chunk of stream) {
      if (signal?.aborted) {
        return { visibleText: visibleTextBuffer, trailerText };
      }

      const content = chunk.choices[0]?.delta?.content;
      if (!content) continue;

      if (isCollectingTrailer) {
        trailerText += content;
        continue;
      }

      const combined = pendingText + content;
      const trailerStartIndex = combined.indexOf(RECOMMENDATIONS_TRAILER_OPEN);
      if (trailerStartIndex >= 0) {
        const visibleText = combined.slice(0, trailerStartIndex);
        emitFormattedVisibleText(visibleText, true);
        trailerText =
          RECOMMENDATIONS_TRAILER_OPEN +
          combined.slice(
            trailerStartIndex + RECOMMENDATIONS_TRAILER_OPEN.length,
          );
        pendingText = '';
        isCollectingTrailer = true;
        continue;
      }

      if (combined.length <= TRAILER_DETECTION_TAIL_LENGTH) {
        pendingText = combined;
        continue;
      }

      const emitLength = combined.length - TRAILER_DETECTION_TAIL_LENGTH;
      const visibleText = combined.slice(0, emitLength);
      pendingText = combined.slice(emitLength);
      emitFormattedVisibleText(visibleText);
    }

    if (!isCollectingTrailer) {
      emitFormattedVisibleText(pendingText, true);
    } else {
      const closeIndex = trailerText.indexOf(RECOMMENDATIONS_TRAILER_CLOSE);
      if (closeIndex >= 0) {
        trailerText = trailerText.slice(
          0,
          closeIndex + RECOMMENDATIONS_TRAILER_CLOSE.length,
        );
      }
    }

    if (!hasEmittedText && !signal?.aborted) {
      throw new BadRequestException('AI 응답을 생성하지 못했습니다.');
    }

    return { visibleText: visibleTextBuffer, trailerText };
  }

  private emitTextIfNotEmpty(text: string, emit: SseEmitter): void {
    if (text.length > 0) {
      emit('text', { content: text });
    }
  }

  private selectConfirmedRecommendationCandidates(
    candidates: SimilarContent[],
    preferredContentType: 'movie' | 'tv' | null,
    previouslyRecommended: string[],
  ): SimilarContent[] {
    const selected: SimilarContent[] = [];
    const usedKeys = new Set<string>();
    const previousTitleKeys = new Set(
      previouslyRecommended.map((title) => this.normalizeTitleForMatch(title)),
    );

    for (const candidate of candidates) {
      if (selected.length >= 5) break;

      const contentType = this.parseContentType(candidate.contentType);
      if (!contentType) continue;
      if (preferredContentType && contentType !== preferredContentType) {
        continue;
      }
      if (!candidate.posterUrl) continue;

      const normalizedTitle = this.normalizeTitleForMatch(candidate.title);
      if (previousTitleKeys.has(normalizedTitle)) continue;

      const key = `${contentType}:${candidate.tmdbId}`;
      if (usedKeys.has(key)) continue;

      usedKeys.add(key);
      selected.push(candidate);
    }

    return selected;
  }

  private toResolvedRecommendations(
    candidates: SimilarContent[],
  ): ResolvedChatRecommendation[] {
    const recommendations: ResolvedChatRecommendation[] = [];

    for (const candidate of candidates) {
      const contentType = this.parseContentType(candidate.contentType);
      if (!contentType || !candidate.posterUrl) continue;

      recommendations.push({
        tmdbId: candidate.tmdbId,
        contentType,
        title: candidate.title,
        posterUrl: candidate.posterUrl,
      });
    }

    return recommendations;
  }

  private cacheRecommendationMetadataInBackground(
    candidates: SimilarContent[],
  ): void {
    const contentIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.contentId)
          .filter((contentId) => Number.isInteger(contentId)),
      ),
    ];

    if (contentIds.length === 0) return;

    this.embeddingService.batchCacheByContentIds(contentIds).catch((error) => {
      this.logger.warn(
        `추천 후보 metadata 캐싱 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private normalizeTitleForMatch(title: string): string {
    return title
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .replace(/\s*시즌(?:\s*\d+)?\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private parseContentType(value: string | undefined): 'movie' | 'tv' | null {
    if (value === 'movie' || value === 'tv') return value;
    return null;
  }

  async buildUserContext(userId: number): Promise<UserContext> {
    const [
      favorites,
      disliked,
      genreStats,
      watchedTmdbIds,
      wantToWatch,
      watchedGenres,
    ] = await Promise.all([
      this.getFavorites(userId),
      this.getDisliked(userId),
      this.getGenreStats(userId),
      this.getWatchedTmdbIds(userId),
      this.getWantToWatch(userId),
      this.getWatchedGenres(userId),
    ]);

    return {
      favorites,
      disliked,
      genreStats,
      watchedTmdbIds,
      wantToWatch,
      watchedGenres,
    };
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
        'c.origin_country AS "originCountry"',
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
      originCountry: row.originCountry ?? null,
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
        'c.origin_country AS "originCountry"',
        'c.director AS "director"',
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
      originCountry: row.originCountry ?? null,
      director: row.director ?? null,
    }));
  }

  private async getGenreStats(userId: number): Promise<GenreStat[]> {
    const rows: RawGenreStatRow[] = await this.reviewRepo
      .createQueryBuilder('r')
      .innerJoin('r.content', 'c')
      .select([
        'jsonb_array_elements(c.genres) ->> \'name\' AS "genre"',
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
        "array_to_string(ARRAY(SELECT jsonb_array_elements(c.genres) ->> 'name'), ', ') AS \"genres\"",
        'c.origin_country AS "originCountry"',
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
      genres: row.genres || '',
      originCountry: row.originCountry ?? null,
    }));
  }

  private async getWatchedGenres(userId: number): Promise<GenreStat[]> {
    const rows: RawGenreStatRow[] = await this.watchlistRepo
      .createQueryBuilder('w')
      .innerJoin('w.content', 'c')
      .leftJoin(
        Review,
        'r',
        'r.userId = w.userId AND r.contentId = w.contentId',
      )
      .select([
        'jsonb_array_elements(c.genres) ->> \'name\' AS "genre"',
        '\'0\' AS "avgRating"',
        'COUNT(*) AS "count"',
      ])
      .where('w.userId = :userId', { userId })
      .andWhere("w.status = 'watched'")
      .andWhere('r.id IS NULL')
      .groupBy('"genre"')
      .orderBy('"count"', 'DESC')
      .getRawMany();

    return rows.map((row) => ({
      genre: row.genre,
      avgRating: row.avgRating,
      count: parseInt(row.count, 10),
    }));
  }

  private async resolveReferenceEmbedding(
    referenceTitles: string[],
  ): Promise<{ embedding: number[]; tmdbId: number } | null> {
    if (referenceTitles.length === 0) return null;

    for (const title of referenceTitles) {
      try {
        // 1. DB에서 title ILIKE 검색 + content_metadata embedding 조회
        interface ReferenceRow {
          content_id: number;
          tmdb_id: number;
          embedding: string;
        }
        const rows: ReferenceRow[] = await this.dataSource.query(
          `SELECT c.id AS content_id, c.tmdb_id, cm.embedding::text
           FROM contents c
           JOIN content_metadata cm ON cm.content_id = c.id
           WHERE c.title ILIKE $1
           LIMIT 1`,
          [title],
        );

        if (rows.length > 0 && rows[0].embedding) {
          try {
            const embedding = JSON.parse(rows[0].embedding) as number[];
            this.logger.log(
              `참조 작품 임베딩 사용: "${title}" (tmdbId: ${rows[0].tmdb_id})`,
            );
            return { embedding, tmdbId: rows[0].tmdb_id };
          } catch {
            this.logger.warn(
              `참조 작품 임베딩 파싱 실패: "${title}" (tmdbId: ${rows[0].tmdb_id})`,
            );
          }
        }

        // 2. DB에 없으면 TMDB 검색 → findOrFetchByTmdbId → 임베딩 캐싱
        const [movieResult, tvResult] = await Promise.all([
          this.contentsService
            .searchContents(title, 'movie', 1)
            .catch(() => null),
          this.contentsService.searchContents(title, 'tv', 1).catch(() => null),
        ]);

        const firstMatch =
          (movieResult?.results?.[0]
            ? { id: movieResult.results[0].id, type: 'movie' as const }
            : null) ??
          (tvResult?.results?.[0]
            ? { id: tvResult.results[0].id, type: 'tv' as const }
            : null);

        if (firstMatch) {
          const content = await this.contentsService.findOrFetchByTmdbId(
            firstMatch.id,
            firstMatch.type,
          );
          const metadata = await this.embeddingService.cacheContentMetadata(
            content.id,
          );
          if (metadata?.embedding) {
            try {
              const embedding = JSON.parse(metadata.embedding) as number[];
              this.logger.log(
                `참조 작품 TMDB 검색 후 임베딩 생성: "${title}" (tmdbId: ${content.tmdbId})`,
              );
              return { embedding, tmdbId: content.tmdbId };
            } catch {
              this.logger.warn(
                `참조 작품 TMDB 임베딩 파싱 실패: "${title}" (tmdbId: ${content.tmdbId})`,
              );
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `참조 작품 임베딩 해결 실패 ("${title}"): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return null;
  }

  private buildFiltersFromIntent(intent: ParsedIntent): ContentSearchFilters {
    const filters: ContentSearchFilters = {};
    if (intent.ottProviderNames.length > 0)
      filters.ottProviderNames = intent.ottProviderNames;
    if (intent.countries.length > 0) filters.countries = intent.countries;
    if (intent.excludeCountries.length > 0)
      filters.excludeCountries = intent.excludeCountries;
    if (intent.personNames.length > 0) filters.personNames = intent.personNames;
    if (intent.dateRange && (intent.dateRange.from || intent.dateRange.to)) {
      filters.dateRange = intent.dateRange;
    }
    if (intent.contentType) filters.contentType = intent.contentType;
    if (intent.genres.length > 0) filters.genres = intent.genres;
    return filters;
  }
}
