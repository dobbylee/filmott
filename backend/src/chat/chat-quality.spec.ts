import { buildFiltersFromIntent } from './intent-filter.mapper';
import type { ContentCatalogService } from '../contents/services/content-catalog.service';
import { DataSource } from 'typeorm';
import type { ContentDiscoveryService } from '../contents/services/content-discovery.service';
import type { ContentSearchFilters } from '../recommendation/recommendation-search.types';
import type { ContentMetadataService } from '../recommendation/content-metadata.service';
import type { ParsedIntent } from './intent-analyzer';
import { CHAT_QUALITY_CASES, type ChatQualityCase } from './chat-quality-cases';
import { RecommendationCandidateService } from '../recommendation/recommendation-candidate.service';
import {
  extractPreviouslyRecommendedTitles,
  resolveStructuredChatResponse,
} from './structured-chat-response';

type FilterQualityCase = ChatQualityCase & {
  expectedFilters: ContentSearchFilters;
};

type CandidateQualityCase = ChatQualityCase & {
  candidateFixture: NonNullable<ChatQualityCase['candidateFixture']>;
};

function hasExpectedFilters(
  testCase: ChatQualityCase,
): testCase is FilterQualityCase {
  return Boolean(testCase.expectedFilters);
}

function hasCandidateFixture(
  testCase: ChatQualityCase,
): testCase is CandidateQualityCase {
  return Boolean(testCase.candidateFixture);
}

function createRecommendationCandidateService(): RecommendationCandidateService {
  const metadataService = {
    batchCacheByContentIds: jest.fn(),
  } as unknown as ContentMetadataService;
  const contentDiscoveryService = {} as unknown as ContentDiscoveryService;
  const dataSource = {
    query: jest.fn(),
  } as unknown as DataSource;

  return new RecommendationCandidateService(
    metadataService,
    contentDiscoveryService,
    dataSource,
    {} as ContentCatalogService,
  );
}

// 이 suite는 기록된 intent 이후의 결정적 정책만 검증한다.
// userMessage/history -> IntentAnalyzer 경계는 intent-analyzer.spec.ts의 replay가 담당한다.
describe('채팅 추천 downstream contract 평가셋 (LLM-free)', () => {
  let recommendationCandidateService: RecommendationCandidateService;

  beforeEach(() => {
    recommendationCandidateService = createRecommendationCandidateService();
  });

  it('케이스 ID가 중복되지 않아야 한다', () => {
    const ids = CHAT_QUALITY_CASES.map((testCase) => testCase.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('핵심 추천 품질 시나리오를 모두 포함해야 한다', () => {
    expect(CHAT_QUALITY_CASES.map((testCase) => testCase.id)).toEqual(
      expect.arrayContaining([
        'vague-new-user',
        'netflix-latest-thriller-tv',
        'multiturn-korean-thriller',
        'reference-parasite',
        'duplicate-recommendation-exclusion',
        'tv-content-type-guard',
        'negative-preference-exclusion',
        'personalized-candidate-rerank',
      ]),
    );
  });

  it('기록된 intent를 검색 필터 계약으로 변환해야 한다', () => {
    const cases = CHAT_QUALITY_CASES.filter(hasExpectedFilters);

    for (const testCase of cases) {
      expect(buildFiltersFromIntent(testCase.recordedStructuredOutput)).toEqual(
        testCase.expectedFilters,
      );
    }
  });

  it('TV 미지원 장르를 SQL에서 제외해도 OTT·날짜·국가·타입 조건은 유지해야 한다', () => {
    const intent: ParsedIntent = {
      ottProviderNames: ['Netflix'],
      countries: ['KR'],
      excludeCountries: [],
      personNames: [],
      referenceTitles: [],
      dateRange: { from: '2025-01-01', to: null },
      contentType: 'tv',
      genres: ['로맨스', '코미디'],
      confidence: 'high',
    };
    expect(buildFiltersFromIntent(intent)).toEqual({
      ottProviderNames: ['Netflix'],
      countries: ['KR'],
      dateRange: { from: '2025-01-01', to: null },
      contentType: 'tv',
      genres: ['코미디'],
    });
    expect(intent.genres).toEqual(['로맨스', '코미디']);
    expect(
      buildFiltersFromIntent({
        ...intent,
        genres: ['로맨스', '로코', '힐링'],
      }),
    ).toEqual({
      ottProviderNames: ['Netflix'],
      countries: ['KR'],
      dateRange: { from: '2025-01-01', to: null },
      contentType: 'tv',
    });
  });

  it('확정 후보에서 이전 추천과 다른 contentType을 제외해야 한다', () => {
    const cases = CHAT_QUALITY_CASES.filter(hasCandidateFixture);

    for (const testCase of cases) {
      const {
        candidates,
        preferredContentType,
        previouslyRecommended,
        rerankContext,
        expectedTitles,
      } = testCase.candidateFixture;

      const selectedTitles = recommendationCandidateService
        .selectConfirmedRecommendationCandidates(
          candidates,
          preferredContentType,
          previouslyRecommended,
          rerankContext,
        )
        .map((candidate) => candidate.title);

      expect(selectedTitles).toEqual(expectedTitles);
    }
  });

  it('구조화 추천이 선택한 확정 후보만 카드 계약으로 유지해야 한다', () => {
    const cases = CHAT_QUALITY_CASES.filter(hasCandidateFixture);

    for (const testCase of cases) {
      const fixture = testCase.candidateFixture;
      const confirmed =
        recommendationCandidateService.selectConfirmedRecommendationCandidates(
          fixture.candidates,
          fixture.preferredContentType,
          fixture.previouslyRecommended,
          fixture.rerankContext,
        );
      const selected = confirmed.slice(0, 1);
      const structuredRecommendations = selected.map((candidate) => ({
        tmdbId: candidate.tmdbId,
        contentType: candidate.contentType as 'movie' | 'tv',
        reason: '테스트 추천 이유예요.',
      }));

      expect(
        resolveStructuredChatResponse(
          {
            message: '',
            recommendations: structuredRecommendations,
            followUpQuestion: '',
          },
          confirmed,
        ).recommendations.map((recommendation) => recommendation.title),
      ).toEqual(selected.map((candidate) => candidate.title));
    }
  });

  it('history recommendations에서 이전 추천 제목을 추출해야 한다', () => {
    const cases = CHAT_QUALITY_CASES.filter(
      (testCase) => (testCase.history?.length ?? 0) > 0,
    );

    for (const testCase of cases) {
      const history = testCase.history ?? [];
      const expectedTitles = history.flatMap((message) =>
        message.role === 'assistant'
          ? (message.recommendations ?? []).map(
              (recommendation) => recommendation.title,
            )
          : [],
      );

      expect(extractPreviouslyRecommendedTitles(history)).toEqual(
        expectedTitles,
      );
    }
  });

  it('개인화 merge 검증에 필요한 입력과 기대 필터를 함께 유지해야 한다', () => {
    const cases = CHAT_QUALITY_CASES.filter(
      (testCase) => testCase.expectedPreferenceFilters,
    );

    expect(cases.map((testCase) => testCase.id)).toEqual(
      expect.arrayContaining([
        'negative-preference-exclusion',
        'personalized-candidate-rerank',
      ]),
    );
    expect(cases.every((testCase) => testCase.preferenceFixture)).toBe(true);
  });
});
