import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { OpenAIModule } from '../integrations/openai/openai.module';
import { OpenAISdkProvider } from '../integrations/openai/openai-sdk.provider';
import { OpenAIChatClient } from '../integrations/openai/openai-chat.client';
import { OpenAIEmbeddingClient } from '../integrations/openai/openai-embedding.client';
import { DataSource } from 'typeorm';
import { ContentMetadataService } from './content-metadata.service';
import { RecommendationSearchService } from './recommendation-search.service';
import { ContentMetadata } from './content-metadata.entity';
import { Content } from '../contents/content.entity';

// OpenAI SDK mock
const mockCreate = jest.fn();
const mockEmbeddingsCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
      embeddings: {
        create: mockEmbeddingsCreate,
      },
    })),
  };
});

describe('RecommendationSearchService', () => {
  let service: RecommendationSearchService;
  let module: TestingModule;

  const mockMetadataRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockContentRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-openai-key'),
  };

  const mockStatementTimeoutQuery = jest.fn().mockResolvedValue([]);
  const mockIterativeScanQuery = jest.fn().mockResolvedValue([]);
  const mockQuery = jest.fn();
  const mockDataSource = {
    query: mockQuery,
    transaction: jest.fn(
      async (
        callback: (manager: {
          query: (query: string, parameters?: unknown[]) => Promise<unknown>;
        }) => Promise<unknown>,
      ) =>
        callback({
          query: async (query, parameters) => {
            if (query.includes("set_config('statement_timeout'")) {
              return mockStatementTimeoutQuery(query, parameters);
            }
            if (query.includes("set_config('hnsw.iterative_scan'")) {
              return mockIterativeScanQuery(query, parameters);
            }
            return mockQuery(query, parameters);
          },
        }),
    ),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [OpenAIModule],
      providers: [
        RecommendationSearchService,
        ContentMetadataService,
        {
          provide: getRepositoryToken(ContentMetadata),
          useValue: mockMetadataRepo,
        },
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    service = module.get<RecommendationSearchService>(
      RecommendationSearchService,
    );
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  it('키가 없으면 사전 계산 벡터가 있어도 외부 호출과 SQL 없이 빈 검색을 반환해야 한다', async () => {
    const sdk = new OpenAISdkProvider(
      new ConfigService({ OPENAI_API_KEY: '' }),
    );
    const metadata = new ContentMetadataService(
      module.get(getRepositoryToken(ContentMetadata)),
      module.get(getRepositoryToken(Content)),
      new OpenAIChatClient(sdk),
      new OpenAIEmbeddingClient(sdk),
      module.get(DataSource),
    );
    const noKey = new RecommendationSearchService(
      module.get(DataSource),
      metadata,
    );
    await expect(noKey.searchSimilar('입력', 10, [], [0.1])).resolves.toEqual(
      [],
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    expect(mockDataSource.query).not.toHaveBeenCalled();
  });

  it('사전 취소된 검색은 생성과 SQL을 시작하지 않아야 한다', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.searchSimilar('입력', 10, [], [0.1], controller.signal),
    ).resolves.toEqual([]);
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    expect(mockDataSource.query).not.toHaveBeenCalled();
  });

  describe('searchSimilar', () => {
    const mockRow = {
      content_id: 1,
      description: '어두운 스릴러',
      tmdb_id: 496243,
      content_type: 'movie',
      title: '기생충',
      poster_url: '/poster.jpg',
      genres: [{ id: 18, name: '드라마' }],
      vote_average: 8.6,
      similarity: 0.95,
      director: '봉준호',
      origin_country: 'KR',
      overview: null,
    };

    const fiveRows = Array.from({ length: 5 }, (_, i) => ({
      ...mockRow,
      content_id: i + 1,
      tmdb_id: 496243 + i,
      title: `영화${i + 1}`,
    }));

    beforeEach(() => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });
    });

    it('유사 작품을 검색하여 반환해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([mockRow]);

      const result = await service.searchSimilar('스릴러 추천', 15, []);

      expect(result).toHaveLength(1);
      expect(result[0].tmdbId).toBe(496243);
      expect(result[0].title).toBe('기생충');
      expect(result[0].similarity).toBe(0.95);
      expect(result[0].director).toBe('봉준호');
      expect(result[0].originCountry).toBe('KR');
    });

    it('제외할 tmdbId를 쿼리에 전달해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchSimilar('테스트', 10, [100, 200]);

      expect(mockDataSource.query).toHaveBeenCalledWith(expect.any(String), [
        expect.any(String),
        [100, 200],
        10,
      ]);
    });

    it('제외 목록이 비어있으면 [-1]로 대체해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchSimilar('테스트', 10, []);

      expect(mockDataSource.query).toHaveBeenCalledWith(expect.any(String), [
        expect.any(String),
        [-1],
        10,
      ]);
    });

    it('필터 없으면 기본 조건(OTT 또는 한국 작품 또는 KOBIS)만 포함해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('테스트', 10, []);

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain(
        "EXISTS (SELECT 1 FROM rankings r WHERE r.content_id = c.id AND r.source = 'kobis')",
      );
      expect(query).toContain(
        'c.watch_providers IS NOT NULL OR c.origin_country LIKE',
      );
      expect(query).not.toContain('content_type =');
      expect(query).not.toContain('release_date >=');
    });

    it('precomputedEmbedding이 있으면 generateEmbedding을 호출하지 않아야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);
      const precomputed = [0.5, 0.6, 0.7];

      await service.searchSimilar('테스트', 10, [], precomputed);

      // generateEmbedding 호출 없이 precomputed 벡터를 사용해야 한다
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('[0.5,0.6,0.7]');
    });

    it('precomputedEmbedding이 없으면 generateEmbedding을 호출해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('테스트', 10, []);

      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    });

    it('adult 콘텐츠를 검색 결과에서 제외해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('스릴러 추천', 10, []);

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('c.adult IS NOT TRUE');
    });

    it('검색 쿼리에 5초 statement timeout을 적용해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('스릴러 추천', 10, []);

      expect(mockStatementTimeoutQuery).toHaveBeenCalledWith(
        expect.stringContaining("set_config('statement_timeout'"),
        ['5000ms'],
      );
    });
  });
});
