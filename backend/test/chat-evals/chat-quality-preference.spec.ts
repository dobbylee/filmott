import type { ContentCatalogService } from '../../src/contents/services/content-catalog.service';
import { ConfigService } from '@nestjs/config';
import { OpenAIChatClient } from '../../src/integrations/openai/openai-chat.client';
import { OpenAISdkProvider } from '../../src/integrations/openai/openai-sdk.provider';
import type { ContentDiscoveryService } from '../../src/contents/services/content-discovery.service';
import { CHAT_QUALITY_CASES, type ChatQualityCase } from './chat-quality-cases';
import { ChatContextService } from '../../src/chat/chat-context.service';
import { ChatResponseStreamService } from '../../src/chat/chat-response-stream.service';
import { ChatService } from '../../src/chat/chat.service';
import type { RecommendationSearchService } from '../../src/recommendation/recommendation-search.service';
import type { ContentMetadataService } from '../../src/recommendation/content-metadata.service';

import type { IntentAnalyzerService } from '../../src/chat/intent-analyzer';
import { RecommendationCandidateService } from '../../src/recommendation/recommendation-candidate.service';

const mockStreamCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        stream: mockStreamCreate,
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
      const metadataService = {
        hasAnyMetadata: jest.fn().mockResolvedValue(true),
        batchCacheByContentIds: jest.fn().mockResolvedValue({
          cached: 0,
          skipped: 0,
          failed: 0,
        }),
      } as unknown as ContentMetadataService;
      const recommendationSearchService = {
        searchSimilar: jest.fn().mockResolvedValue([]),
        searchWithFilters: jest.fn().mockResolvedValue([]),
      } as unknown as RecommendationSearchService;
      const intentAnalyzer = {
        analyzeIntent: jest
          .fn()
          .mockResolvedValue(testCase.recordedStructuredOutput),
        buildSemanticQuery: jest.fn().mockReturnValue(testCase.userMessage),
      } as unknown as IntentAnalyzerService;
      const chatContextService = {
        buildChatContext: jest.fn().mockResolvedValue({
          userContext: testCase.preferenceFixture.userContext,
          subscribedOtts: testCase.preferenceFixture.subscribedOtts,
        }),
      } as unknown as ChatContextService;
      const contentDiscoveryService = {} as ContentDiscoveryService;
      const dataSource = {
        query: jest.fn().mockResolvedValue([]),
      } as unknown as ConstructorParameters<
        typeof RecommendationCandidateService
      >[2];
      const recommendationCandidateService = new RecommendationCandidateService(
        metadataService,
        contentDiscoveryService,
        dataSource,
        {} as ContentCatalogService,
      );
      const configService = {
        get: jest.fn().mockReturnValue('test-openai-key'),
      } as unknown as ConfigService;
      const service = new ChatService(
        metadataService,
        recommendationSearchService,
        intentAnalyzer,
        chatContextService,
        recommendationCandidateService,
        new ChatResponseStreamService(
          new OpenAIChatClient(new OpenAISdkProvider(configService)),
        ),
      );
      mockStreamCreate.mockReturnValueOnce(createResponseStream());

      await service.sendMessageStream(
        1,
        testCase.userMessage,
        testCase.history ?? [],
        jest.fn(),
      );

      expect(
        recommendationSearchService.searchWithFilters,
      ).toHaveBeenCalledWith(
        expect.any(String),
        20,
        expect.any(Array),
        testCase.expectedPreferenceFilters,
        undefined,
      );
    },
  );
});
