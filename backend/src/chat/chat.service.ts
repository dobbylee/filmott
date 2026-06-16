import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CHAT_MODEL } from './chat.constants';
import { EmbeddingService, SimilarContent } from './embedding.service';
import {
  ContentSearchService,
  ContentSearchFilters,
  type RelaxableFilterKey,
} from './content-search.service';
import { User } from '../users/user.entity';
import { buildSystemPrompt, UserContext } from './prompts/system-prompt';
import { OTT_PROVIDERS } from '../common/ott-providers';
import {
  extractUserPreference,
  enrichQueryWithPreference,
} from './user-preference';
import { IntentAnalyzerService, ParsedIntent } from './intent-analyzer';
import { ChatHistoryMessageDto } from './dto/send-message.dto';
import { extractPreviouslyRecommendedTitles } from './structured-chat-response';
import { ChatContextService } from './chat-context.service';
import {
  RecommendationCandidateService,
  type RecommendationRerankContext,
} from './recommendation-candidate.service';
import { ChatResponseStreamService } from './chat-response-stream.service';

const OPENAI_CHAT_TIMEOUT_MS = 30_000;

type SseEmitter = (event: string, data: unknown) => void;

@Injectable()
export class ChatService {
  private readonly openai: OpenAI | null;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly contentSearchService: ContentSearchService,
    private readonly intentAnalyzer: IntentAnalyzerService,
    private readonly chatContextService: ChatContextService,
    private readonly recommendationCandidateService: RecommendationCandidateService,
    private readonly chatResponseStreamService: ChatResponseStreamService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
        this.chatContextService.buildUserContext(userId),
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
    let candidateRerankContext: RecommendationRerankContext = {};

    if (hasMetadata) {
      const userMessages = (history || [])
        .filter((msg) => msg.role === 'user')
        .map((msg) => msg.content);
      userMessages.push(content);
      const searchQuery = userMessages.join(' ');

      // 3. LLM 의도 분석 → 최근 대화 맥락 포함 (멀티턴)
      intent = await this.intentAnalyzer.analyzeIntent(content, history);

      // 4. ParsedIntent → ContentSearchFilters 변환
      const filters =
        this.recommendationCandidateService.buildFiltersFromIntent(intent);

      // 5. 쿼리 정제: 메타데이터 키워드 제거 후 의미적 쿼리만 사용
      const semanticQuery = this.intentAnalyzer.buildSemanticQuery(
        searchQuery,
        intent,
      );

      // 6. 참조 작품 임베딩 해결
      const referenceResult =
        await this.recommendationCandidateService.resolveReferenceEmbedding(
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
        const mergedFilters: ContentSearchFilters = {
          ...filters,
          relaxableFilterKeys: [],
        };
        const relaxableFilterKeys: RelaxableFilterKey[] = [];

        if (
          !mergedFilters.ottProviderNames?.length &&
          userPref.ottProviderNames.length > 0
        ) {
          mergedFilters.ottProviderNames = userPref.ottProviderNames;
          relaxableFilterKeys.push('ottProviderNames');
        }
        if (
          !mergedFilters.genres?.length &&
          userPref.preferredGenres.length > 0
        ) {
          mergedFilters.genres = userPref.preferredGenres;
          relaxableFilterKeys.push('genres');
        }
        if (
          !mergedFilters.countries?.length &&
          userPref.preferredCountries.length > 0
        ) {
          mergedFilters.countries = userPref.preferredCountries;
          relaxableFilterKeys.push('countries');
        }
        mergedFilters.relaxableFilterKeys = relaxableFilterKeys;

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
        candidateRerankContext = this.buildCandidateRerankContext(
          intent,
          mergedFilters,
        );

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
          const prefOnlyFilters: ContentSearchFilters = {
            relaxableFilterKeys: [],
          };
          const relaxableFilterKeys: RelaxableFilterKey[] = [];
          if (userPref.ottProviderNames.length > 0) {
            prefOnlyFilters.ottProviderNames = userPref.ottProviderNames;
            relaxableFilterKeys.push('ottProviderNames');
          }
          if (userPref.preferredGenres.length > 0) {
            prefOnlyFilters.genres = userPref.preferredGenres;
            relaxableFilterKeys.push('genres');
          }
          if (userPref.preferredCountries.length > 0) {
            prefOnlyFilters.countries = userPref.preferredCountries;
            relaxableFilterKeys.push('countries');
          }
          if (userPref.excludeGenres.length > 0)
            prefOnlyFilters.excludeGenres = userPref.excludeGenres;
          if (userPref.excludePersonNames.length > 0)
            prefOnlyFilters.excludePersonNames = userPref.excludePersonNames;
          prefOnlyFilters.relaxableFilterKeys = relaxableFilterKeys;
          candidateRerankContext = this.buildCandidateRerankContext(
            intent,
            prefOnlyFilters,
          );

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
      this.recommendationCandidateService.selectConfirmedRecommendationCandidates(
        similarContents,
        intent.contentType,
        previouslyRecommended,
        candidateRerankContext,
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

    await this.chatResponseStreamService.emitStreamingText(
      stream,
      emit,
      signal,
    );

    if (signal?.aborted) {
      return;
    }

    const matched =
      this.recommendationCandidateService.toResolvedRecommendations(
        confirmedRecommendationCandidates,
      );

    if (matched.length > 0) {
      emit('recommendations', { recommendations: matched });
      this.recommendationCandidateService.cacheRecommendationMetadataInBackground(
        confirmedRecommendationCandidates,
      );
    }

    emit('done', {});
  }

  async buildUserContext(userId: number): Promise<UserContext> {
    return this.chatContextService.buildUserContext(userId);
  }

  private buildCandidateRerankContext(
    intent: ParsedIntent,
    filters: ContentSearchFilters,
  ): RecommendationRerankContext {
    return {
      contentType: intent.contentType ?? undefined,
      genres: filters.genres ?? [],
      countries: filters.countries ?? [],
      personNames: filters.personNames ?? [],
    };
  }
}
