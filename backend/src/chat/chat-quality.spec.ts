import { DataSource } from 'typeorm';
import type { ContentsService } from '../contents/contents.service';
import type { ContentSearchFilters } from './content-search.service';
import type { EmbeddingService } from './embedding.service';
import { CHAT_QUALITY_CASES, type ChatQualityCase } from './chat-quality-cases';
import { RecommendationCandidateService } from './recommendation-candidate.service';
import {
  extractPreviouslyRecommendedTitles,
  matchStructuredRecommendationsToCandidates,
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
      expect(
        recommendationCandidateService.buildFiltersFromIntent(
          testCase.recordedStructuredOutput,
        ),
      ).toEqual(testCase.expectedFilters);
    }
  });

  it('기록된 intent는 사람이 검토한 핵심 기대값과 일치해야 한다', () => {
    for (const testCase of CHAT_QUALITY_CASES) {
      if (!testCase.expectedIntent) continue;
      expect(testCase.recordedStructuredOutput).toMatchObject(
        testCase.expectedIntent,
      );
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

  it('본문 trailer가 선택한 확정 후보와의 교집합만 카드 계약으로 유지해야 한다', () => {
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
      const trailerRecommendations = [
        ...selected.map((candidate) => ({
          tmdbId: candidate.tmdbId,
          contentType: candidate.contentType as 'movie' | 'tv',
        })),
        { tmdbId: 999999, contentType: 'movie' as const },
      ];

      expect(
        matchStructuredRecommendationsToCandidates(
          trailerRecommendations,
          confirmed,
        ).map((recommendation) => recommendation.title),
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
