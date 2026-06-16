import type { ContentSearchFilters } from './content-search.service';
import type { ChatHistoryMessageDto } from './dto/send-message.dto';
import type { SimilarContent } from './embedding.service';
import type { ParsedIntent } from './intent-analyzer';
import type { RecommendationRerankContext } from './recommendation-candidate.service';

export interface ChatQualityCase {
  id: string;
  description: string;
  userMessage: string;
  history?: ChatHistoryMessageDto[];
  expectedIntent?: Partial<ParsedIntent>;
  expectedFilters?: ContentSearchFilters;
  expectedPreferenceFilters?: ContentSearchFilters;
  candidateFixture?: {
    candidates: SimilarContent[];
    preferredContentType: 'movie' | 'tv' | null;
    previouslyRecommended: string[];
    rerankContext?: RecommendationRerankContext;
    expectedTitles: string[];
  };
}

function createSimilarContent(
  overrides: Partial<SimilarContent> & Pick<SimilarContent, 'title' | 'tmdbId'>,
): SimilarContent {
  const { contentId, title, tmdbId, ...rest } = overrides;

  return {
    contentId: contentId ?? tmdbId,
    tmdbId,
    contentType: 'movie',
    title,
    posterUrl: '/poster.jpg',
    genres: [{ id: 18, name: '드라마' }],
    voteAverage: 8,
    description: `${title} 설명`,
    similarity: 0.8,
    director: null,
    originCountry: 'KR',
    overview: null,
    ...rest,
  };
}

export const CHAT_QUALITY_CASES: ChatQualityCase[] = [
  {
    id: 'vague-new-user',
    description: '모호한 신규 유저 요청은 낮은 confidence를 유지한다',
    userMessage: '오늘 뭐 볼까?',
    expectedIntent: {
      confidence: 'low',
      genres: [],
      contentType: null,
    },
    expectedFilters: {},
  },
  {
    id: 'netflix-latest-thriller-tv',
    description: 'OTT, 최신성, 장르, 시리즈 조건을 함께 유지한다',
    userMessage: '넷플릭스에서 볼 최신 스릴러 시리즈 추천해줘',
    expectedIntent: {
      ottProviderNames: ['Netflix'],
      genres: ['스릴러'],
      contentType: 'tv',
      confidence: 'high',
    },
    expectedFilters: {
      ottProviderNames: ['Netflix'],
      genres: ['스릴러'],
      contentType: 'tv',
    },
  },
  {
    id: 'multiturn-korean-thriller',
    description: '후속 질문에서 이전 한국 스릴러 조건을 유지한다',
    userMessage: '더 무서운 거 없어?',
    history: [
      { role: 'user', content: '한국 스릴러 추천해줘' },
      {
        role: 'assistant',
        content: '**곡성** - 불길한 분위기가 강한 한국 스릴러예요.',
        recommendations: [
          { tmdbId: 293670, contentType: 'movie', title: '곡성' },
        ],
      },
    ],
    expectedIntent: {
      countries: ['KR'],
      genres: ['스릴러', '공포'],
      confidence: 'high',
    },
    expectedFilters: {
      countries: ['KR'],
      genres: ['스릴러', '공포'],
    },
  },
  {
    id: 'reference-parasite',
    description: '참조 작품 요청은 referenceTitles를 유지한다',
    userMessage: '기생충 같은 영화 추천해줘',
    expectedIntent: {
      referenceTitles: ['기생충'],
      contentType: 'movie',
      confidence: 'high',
    },
    expectedFilters: {
      contentType: 'movie',
    },
  },
  {
    id: 'duplicate-recommendation-exclusion',
    description: '이전 추천작은 확정 후보에서 제외한다',
    userMessage: '다른 한국 영화 추천해줘',
    history: [
      {
        role: 'assistant',
        content: '**기생충** - 계급 풍자가 강렬한 영화예요.',
        recommendations: [
          { tmdbId: 496243, contentType: 'movie', title: '기생충' },
        ],
      },
    ],
    expectedIntent: {
      countries: ['KR'],
      contentType: 'movie',
      confidence: 'high',
    },
    expectedFilters: {
      countries: ['KR'],
      contentType: 'movie',
    },
    candidateFixture: {
      preferredContentType: 'movie',
      previouslyRecommended: ['기생충'],
      expectedTitles: ['버닝'],
      candidates: [
        createSimilarContent({
          contentId: 1,
          tmdbId: 496243,
          title: '기생충',
          similarity: 0.95,
        }),
        createSimilarContent({
          contentId: 2,
          tmdbId: 491584,
          title: '버닝',
          similarity: 0.9,
        }),
      ],
    },
  },
  {
    id: 'tv-content-type-guard',
    description: '시리즈 요청에서는 movie 후보를 확정 후보에서 제외한다',
    userMessage: '몰입감 있는 시리즈 추천해줘',
    expectedIntent: {
      contentType: 'tv',
      confidence: 'high',
    },
    expectedFilters: {
      contentType: 'tv',
    },
    candidateFixture: {
      preferredContentType: 'tv',
      previouslyRecommended: [],
      expectedTitles: ['시그널'],
      candidates: [
        createSimilarContent({
          contentId: 3,
          tmdbId: 496243,
          title: '기생충',
          contentType: 'movie',
          similarity: 0.95,
        }),
        createSimilarContent({
          contentId: 4,
          tmdbId: 66082,
          title: '시그널',
          contentType: 'tv',
          similarity: 0.88,
        }),
      ],
    },
  },
  {
    id: 'negative-preference-exclusion',
    description: '비선호 장르와 감독은 개인화 검색 제외 조건으로 유지한다',
    userMessage: '오늘 뭐 볼까?',
    expectedIntent: {
      confidence: 'low',
      genres: [],
      contentType: null,
    },
    expectedFilters: {},
    expectedPreferenceFilters: {
      excludeGenres: ['공포'],
      excludePersonNames: ['감독A'],
    },
  },
  {
    id: 'personalized-candidate-rerank',
    description: '개인화 기준에 더 맞는 후보를 확정 후보 앞순위로 재랭킹한다',
    userMessage: '내 취향에 맞는 영화 추천해줘',
    expectedIntent: {
      confidence: 'low',
      genres: [],
      contentType: null,
    },
    expectedFilters: {},
    expectedPreferenceFilters: {
      genres: ['스릴러'],
      countries: ['KR'],
    },
    candidateFixture: {
      preferredContentType: null,
      previouslyRecommended: [],
      rerankContext: {
        genres: ['스릴러'],
        countries: ['KR'],
      },
      expectedTitles: ['추격자', '인기 로맨스'],
      candidates: [
        createSimilarContent({
          contentId: 5,
          tmdbId: 100001,
          title: '인기 로맨스',
          genres: [{ id: 10749, name: '로맨스' }],
          originCountry: 'US',
          similarity: 0.95,
          voteAverage: 8,
        }),
        createSimilarContent({
          contentId: 6,
          tmdbId: 13855,
          title: '추격자',
          genres: [{ id: 53, name: '스릴러' }],
          originCountry: 'KR',
          similarity: 0.82,
          voteAverage: 8.1,
        }),
      ],
    },
  },
];
