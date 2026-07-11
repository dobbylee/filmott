import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { ContentsService } from '../contents/contents.service';
import type { User } from '../users/user.entity';
import { CHAT_QUALITY_CASES, type ChatQualityCase } from './chat-quality-cases';
import { ChatContextService } from './chat-context.service';
import { ChatResponseStreamService } from './chat-response-stream.service';
import { ChatService } from './chat.service';
import type { ContentSearchService } from './content-search.service';
import type { EmbeddingService } from '../embedding/embedding.service';
import type { IntentAnalyzerService } from './intent-analyzer';
import { RecommendationCandidateService } from './recommendation-candidate.service';

const mockStreamCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockStreamCreate,
      },
    },
  })),
}));

type PreferenceQualityCase = ChatQualityCase & {
  expectedPreferenceFilters: NonNullable<
    ChatQualityCase['expectedPreferenceFilters']
  >;
  preferenceFixture: NonNullable<ChatQualityCase['preferenceFixture']>;
};

function hasPreferenceFixture(
  testCase: ChatQualityCase,
): testCase is PreferenceQualityCase {
  return Boolean(
    testCase.expectedPreferenceFilters && testCase.preferenceFixture,
  );
}

async function* createResponseStream() {
  yield {
    choices: [
      {
        delta: {
          content: JSON.stringify({
            message: '추천 결과입니다.',
            recommendations: [],
            followUpQuestion: '',
          }),
        },
      },
    ],
  };
  yield {
    choices: [{ delta: {}, finish_reason: 'stop' }],
  };
}

describe('채팅 품질 개인화 merge/relaxation contract', () => {
  it.each(CHAT_QUALITY_CASES.filter(hasPreferenceFixture))(
    '$id fixture는 실제 ChatService 검색 필터와 일치해야 한다',
    async (testCase) => {
      const embeddingService = {
        hasAnyMetadata: jest.fn().mockResolvedValue(true),
        searchSimilar: jest.fn().mockResolvedValue([]),
        batchCacheByContentIds: jest.fn().mockResolvedValue({
          cached: 0,
          skipped: 0,
          failed: 0,
        }),
      } as unknown as EmbeddingService;
      const contentSearchService = {
        searchWithFilters: jest.fn().mockResolvedValue([]),
      } as unknown as ContentSearchService;
      const intentAnalyzer = {
        analyzeIntent: jest
          .fn()
          .mockResolvedValue(testCase.recordedStructuredOutput),
        buildSemanticQuery: jest.fn().mockReturnValue(testCase.userMessage),
      } as unknown as IntentAnalyzerService;
      const chatContextService = {
        buildUserContext: jest
          .fn()
          .mockResolvedValue(testCase.preferenceFixture.userContext),
      } as unknown as ChatContextService;
      const contentsService = {} as ContentsService;
      const dataSource = {
        query: jest.fn().mockResolvedValue([]),
      } as unknown as ConstructorParameters<
        typeof RecommendationCandidateService
      >[2];
      const recommendationCandidateService = new RecommendationCandidateService(
        embeddingService,
        contentsService,
        dataSource,
      );
      const userRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          subscribedOtts: testCase.preferenceFixture.subscribedOtts,
        }),
      } as unknown as Repository<User>;
      const configService = {
        get: jest.fn().mockReturnValue('test-openai-key'),
      } as unknown as ConfigService;
      const service = new ChatService(
        embeddingService,
        contentSearchService,
        intentAnalyzer,
        chatContextService,
        recommendationCandidateService,
        new ChatResponseStreamService(),
        userRepository,
        configService,
      );
      mockStreamCreate.mockResolvedValueOnce(createResponseStream());

      await service.sendMessageStream(
        1,
        testCase.userMessage,
        testCase.history ?? [],
        jest.fn(),
      );

      expect(contentSearchService.searchWithFilters).toHaveBeenCalledWith(
        expect.any(String),
        20,
        expect.any(Array),
        testCase.expectedPreferenceFilters,
        undefined,
      );
    },
  );
});
