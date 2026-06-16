import { DataSource } from 'typeorm';
import type { ContentsService } from '../contents/contents.service';
import type { ContentSearchFilters } from './content-search.service';
import type { EmbeddingService } from './embedding.service';
import type { ParsedIntent } from './intent-analyzer';
import { CHAT_QUALITY_CASES, type ChatQualityCase } from './chat-quality-cases';
import { RecommendationCandidateService } from './recommendation-candidate.service';
import { extractPreviouslyRecommendedTitles } from './structured-chat-response';

const BASE_INTENT: ParsedIntent = {
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

type FilterQualityCase = ChatQualityCase & {
  expectedIntent: Partial<ParsedIntent>;
  expectedFilters: ContentSearchFilters;
};

type CandidateQualityCase = ChatQualityCase & {
  candidateFixture: NonNullable<ChatQualityCase['candidateFixture']>;
};

function toIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return { ...BASE_INTENT, ...overrides };
}

function hasExpectedFilters(
  testCase: ChatQualityCase,
): testCase is FilterQualityCase {
  return Boolean(testCase.expectedIntent && testCase.expectedFilters);
}

function hasCandidateFixture(
  testCase: ChatQualityCase,
): testCase is CandidateQualityCase {
  return Boolean(testCase.candidateFixture);
}

function createRecommendationCandidateService(): RecommendationCandidateService {
  const embeddingService = {
    batchCacheByContentIds: jest.fn(),
  } as unknown as EmbeddingService;
  const contentsService = {} as unknown as ContentsService;
  const dataSource = {
    query: jest.fn(),
  } as unknown as DataSource;

  return new RecommendationCandidateService(
    embeddingService,
    contentsService,
    dataSource,
  );
}

describe('채팅 추천 품질 평가셋', () => {
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

  it('기대 intent를 검색 필터 계약으로 변환해야 한다', () => {
    const cases = CHAT_QUALITY_CASES.filter(hasExpectedFilters);

    for (const testCase of cases) {
      expect(
        recommendationCandidateService.buildFiltersFromIntent(
          toIntent(testCase.expectedIntent),
        ),
      ).toEqual(testCase.expectedFilters);
    }
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

  it('개인화 제외 필터 기준 케이스를 유지해야 한다', () => {
    const cases = CHAT_QUALITY_CASES.filter(
      (testCase) => testCase.expectedPreferenceFilters,
    );

    expect(cases.map((testCase) => testCase.id)).toEqual(
      expect.arrayContaining([
        'negative-preference-exclusion',
        'personalized-candidate-rerank',
      ]),
    );
  });
});
