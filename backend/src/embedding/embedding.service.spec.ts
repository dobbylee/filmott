import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmbeddingService } from './embedding.service';
import { ContentMetadata } from './entities/content-metadata.entity';
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

describe('EmbeddingService', () => {
  let service: EmbeddingService;

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
  const mockDataSource = {
    query: jest.fn(),
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
            return mockDataSource.query(query, parameters);
          },
        }),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: getRepositoryToken(ContentMetadata),
          useValue: mockMetadataRepo,
        },
        { provide: getRepositoryToken(Content), useValue: mockContentRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hasAnyMetadata', () => {
    it('메타데이터가 존재하면 true를 반환해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([{ exists: true }]);

      const result = await service.hasAnyMetadata();

      expect(result).toBe(true);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT EXISTS'),
      );
    });

    it('메타데이터가 없으면 false를 반환해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([{ exists: false }]);

      const result = await service.hasAnyMetadata();

      expect(result).toBe(false);
    });

    it('결과를 캐싱하여 두 번째 호출에서는 DB 조회하지 않아야 한다', async () => {
      mockDataSource.query.mockResolvedValue([{ exists: true }]);

      await service.hasAnyMetadata();
      mockDataSource.query.mockClear();

      const result = await service.hasAnyMetadata();

      expect(result).toBe(true);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('generateEmbedding', () => {
    it('OpenAI 임베딩 요청에 AbortSignal을 전달해야 한다', async () => {
      const controller = new AbortController();
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2] }],
      });

      await service.generateEmbedding('테스트 텍스트', controller.signal);

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('텍스트를 임베딩 벡터로 변환해야 한다', async () => {
      const mockEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      const result = await service.generateEmbedding('테스트 텍스트');

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
        { model: 'text-embedding-3-small', input: '테스트 텍스트' },
        expect.objectContaining({ timeout: 10_000 }),
      );
    });
  });

  describe('generateDescription', () => {
    it('작품 정보를 기반으로 설명을 생성해야 한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          { message: { content: '어두운 분위기의 범죄 스릴러입니다.' } },
        ],
      });

      const content = {
        title: '기생충',
        genres: [
          { id: 18, name: '드라마' },
          { id: 53, name: '스릴러' },
        ],
        overview: '전원 백수로 살아가는 기택 가족.',
        credits: [{ name: '송강호' }, { name: '이선균' }],
        releaseDate: new Date('2019-05-30'),
      } as Content;

      const result = await service.generateDescription(content);

      expect(result).toBe('어두운 분위기의 범죄 스릴러입니다.');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.4-nano',
          reasoning_effort: 'low',
          max_completion_tokens: 2048,
        }),
        expect.objectContaining({ timeout: 10_000 }),
      );
    });

    it('줄거리와 출연진이 없으면 "정보 없음"으로 처리해야 한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '설명 없음.' } }],
      });

      const content = {
        title: '테스트 영화',
        genres: [],
        overview: undefined,
        credits: undefined,
        releaseDate: undefined,
      } as unknown as Content;

      await service.generateDescription(content);

      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages[0].content;
      expect(userMessage).toContain('정보 없음');
    });
  });

  describe('cacheContentMetadata', () => {
    it('이미 캐싱된 콘텐츠는 skip해야 한다', async () => {
      const existing = { id: 1, contentId: 100, description: '기존 설명' };
      mockMetadataRepo.findOne.mockResolvedValue(existing);

      const result = await service.cacheContentMetadata(100);

      expect(result).toEqual(existing);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('force 옵션이 true이면 재생성해야 한다', async () => {
      const existing = {
        id: 1,
        contentId: 100,
        description: '새로운 설명',
        embedding: '[0.1,0.2,0.3]',
      };

      const content = {
        id: 100,
        title: '기생충',
        genres: [{ id: 18, name: '드라마' }],
        overview: '줄거리',
        credits: [],
        releaseDate: new Date('2019-05-30'),
      } as unknown as Content;
      mockContentRepo.findOne.mockResolvedValue(content);

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '새로운 설명' } }],
      });

      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      mockDataSource.query.mockResolvedValue([]);
      mockMetadataRepo.findOne.mockResolvedValue(existing);

      await service.cacheContentMetadata(100, true);

      expect(mockCreate).toHaveBeenCalled();
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [100, '새로운 설명', expect.stringContaining('[')],
      );
    });

    it('콘텐츠가 존재하지 않으면 null을 반환해야 한다', async () => {
      // force=false: 첫 findOne이 null이면 캐시 미스 → contentRepo.findOne 호출
      mockMetadataRepo.findOne.mockResolvedValueOnce(null);
      mockContentRepo.findOne.mockResolvedValue(null);

      const result = await service.cacheContentMetadata(999);

      expect(result).toBeNull();
    });

    it('upsert 패턴으로 메타데이터를 저장해야 한다', async () => {
      mockMetadataRepo.findOne
        .mockResolvedValueOnce(null) // 캐시 미스
        .mockResolvedValueOnce({ id: 1, contentId: 100, description: '설명' }); // upsert 후 조회

      const content = {
        id: 100,
        title: '테스트',
        genres: [],
        overview: '설명',
        credits: [],
        releaseDate: new Date(),
      } as unknown as Content;
      mockContentRepo.findOne.mockResolvedValue(content);

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '생성된 설명' } }],
      });
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2] }],
      });
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.cacheContentMetadata(100);

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [100, '생성된 설명', '[0.1,0.2]'],
      );
      expect(result).toBeDefined();
    });
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
        "LEFT JOIN rankings r ON r.content_id = c.id AND r.source = 'kobis'",
      );
      expect(query).toContain(
        'c.watch_providers IS NOT NULL OR c.origin_country LIKE',
      );
      expect(query).toContain('r.id IS NOT NULL');
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

  describe('findRelatedContents', () => {
    const relatedRow = {
      tmdb_id: 27205,
      content_type: 'movie',
      title: '인셉션',
      poster_url: '/inception.jpg',
      release_date: '2010-07-16',
      vote_average: 8.4,
    };
    const sourceRow = {
      content_id: 1,
      genres: [{ id: 28, name: '액션' }],
      embedding: '[1,0,0]',
    };
    const sixRelatedRows = Array.from({ length: 6 }, (_, index) => ({
      ...relatedRow,
      tmdb_id: relatedRow.tmdb_id + index,
      title: `관련 작품 ${index + 1}`,
    }));

    it('같은 타입과 장르의 저장된 벡터 후보를 반환해야 한다', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([sourceRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(sixRelatedRows);

      const result = await service.findRelatedContents(496243, 'movie', 6);

      expect(result).toHaveLength(6);
      expect(result[0]).toEqual({
        tmdbId: 27205,
        contentType: 'movie',
        title: '관련 작품 1',
        posterUrl: '/inception.jpg',
        releaseDate: '2010-07-16',
        voteAverage: 8.4,
      });
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();

      const [sourceQuery, sourceParameters] = mockDataSource.query.mock
        .calls[0] as [string, unknown[]];
      const [freshQuery, freshParameters] = mockDataSource.query.mock
        .calls[1] as [string, unknown[]];
      const [vectorQuery, vectorParameters] = mockDataSource.query.mock
        .calls[2] as [string, unknown[]];
      expect(sourceQuery).toContain('FROM contents source_content');
      expect(sourceQuery).toContain('LEFT JOIN content_metadata');
      expect(sourceQuery).toContain('source_metadata.embedding::text');
      expect(sourceQuery).toContain('source_content.adult IS NOT TRUE');
      expect(sourceQuery).toContain('source_content.vote_count >= $3');
      expect(sourceParameters).toEqual([496243, 'movie', 100]);
      expect(freshQuery).toContain('WITH recent_pool AS MATERIALIZED');
      expect(freshQuery).toContain('LIMIT $1');
      expect(freshQuery).toContain('NOT EXISTS');
      expect(freshParameters).toEqual([600, 1, 'movie', [28], 100, 2]);
      expect(vectorQuery).toContain('FROM content_metadata cm');
      expect(vectorQuery).toContain('cm.content_id <> $4');
      expect(vectorQuery).toContain('c.content_type = $5');
      expect(vectorQuery).toContain("(genre ->> 'id')::int = ANY($6::int[])");
      expect(vectorQuery).toContain('ORDER BY cm.embedding <=> $1::vector');
      expect(vectorQuery).toContain('c.adult IS NOT TRUE');
      expect(vectorQuery).toContain("NULLIF(BTRIM(c.title), '') IS NOT NULL");
      expect(vectorQuery).toContain(
        "NULLIF(BTRIM(c.poster_url), '') IS NOT NULL",
      );
      expect(vectorQuery).toContain('EXISTS (SELECT 1 FROM reviews');
      expect(vectorQuery).toContain('c.vote_count >= $2');
      expect(vectorParameters).toEqual(['[1,0,0]', 100, 6, 1, 'movie', [28]]);
    });

    it('source metadata가 없어도 최신 후보와 인기 후보를 조합해야 한다', async () => {
      const freshRow = {
        ...relatedRow,
        tmdb_id: 30001,
        title: '최신 작품',
      };
      mockDataSource.query
        .mockResolvedValueOnce([{ ...sourceRow, embedding: null }])
        .mockResolvedValueOnce([freshRow])
        .mockResolvedValueOnce([relatedRow]);

      const result = await service.findRelatedContents(496243, 'movie', 6);

      expect(result.map((item) => item.tmdbId)).toEqual([27205, 30001]);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
      const [popularQuery, popularParameters] = mockDataSource.query.mock
        .calls[2] as [string, unknown[]];
      expect(popularQuery).toContain('WITH popular_pool AS MATERIALIZED');
      expect(popularQuery).toContain('popular.vote_count DESC');
      expect(popularQuery).toContain('popular_metadata.content_id = c.id');
      expect(popularParameters).toEqual([600, 1, 'movie', [28], 100, 12]);
    });

    it('쿼리에 transaction-local timeout과 HNSW strict order를 적용해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.findRelatedContents(496243, 'movie', 6);

      expect(mockStatementTimeoutQuery).toHaveBeenCalledWith(
        expect.stringContaining("set_config('statement_timeout'"),
        ['5000ms'],
      );
      expect(mockIterativeScanQuery).toHaveBeenCalledWith(
        expect.stringContaining("set_config('hnsw.iterative_scan'"),
        undefined,
      );
    });

    it('예상하지 못한 raw row를 신뢰하지 않아야 한다', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([sourceRow])
        .mockResolvedValueOnce([{ ...relatedRow, tmdb_id: '27205' }]);

      await expect(
        service.findRelatedContents(496243, 'movie', 6),
      ).rejects.toThrow('관련 작품 조회 결과 형식이 올바르지 않습니다');
    });

    it('장르 정보가 올바르지 않은 source는 후보 쿼리를 실행하지 않아야 한다', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { ...sourceRow, genres: [{ id: '28' }] },
      ]);

      await expect(
        service.findRelatedContents(496243, 'movie', 6),
      ).resolves.toEqual([]);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('벡터 후보 중복을 제거하고 인기 후보로 부족한 자리를 채워야 한다', async () => {
      const freshRows = [
        { ...relatedRow, tmdb_id: 31001, title: '최신 1' },
        { ...relatedRow, tmdb_id: 31002, title: '최신 2' },
      ];
      const vectorRow = { ...relatedRow, tmdb_id: 32001, title: '벡터 1' };
      const popularRows = [
        vectorRow,
        { ...relatedRow, tmdb_id: 33001, title: '인기 1' },
        { ...relatedRow, tmdb_id: 33002, title: '인기 2' },
        { ...relatedRow, tmdb_id: 33003, title: '인기 3' },
      ];
      mockDataSource.query
        .mockResolvedValueOnce([sourceRow])
        .mockResolvedValueOnce(freshRows)
        .mockResolvedValueOnce([vectorRow])
        .mockResolvedValueOnce(popularRows);

      const result = await service.findRelatedContents(496243, 'movie', 6);

      expect(result.map((item) => item.tmdbId)).toEqual([
        32001, 33001, 33002, 33003, 31001, 31002,
      ]);
    });

    it('최대 6개 결과를 캐시하고 요청 limit만큼 잘라 반환해야 한다', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([sourceRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(sixRelatedRows);

      const first = await service.findRelatedContents(496243, 'movie', 2);
      const second = await service.findRelatedContents(496243, 'movie', 6);

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(6);
      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
    });

    it('빈 결과도 1시간 동안 캐시해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.findRelatedContents(496243, 'movie', 6);
      await service.findRelatedContents(496243, 'movie', 6);

      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('동일 작품의 동시 요청을 하나의 DB 조회로 합쳐야 한다', async () => {
      let resolveSource: ((value: unknown[]) => void) | undefined;
      mockDataSource.query.mockImplementationOnce(
        () =>
          new Promise<unknown[]>((resolve) => {
            resolveSource = resolve;
          }),
      );

      const first = service.findRelatedContents(496243, 'movie', 6);
      const second = service.findRelatedContents(496243, 'movie', 3);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(resolveSource).toBeDefined();
      if (resolveSource) resolveSource([]);

      await expect(first).resolves.toEqual([]);
      await expect(second).resolves.toEqual([]);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('실패한 조회는 캐시하지 않아야 한다', async () => {
      mockDataSource.query
        .mockRejectedValueOnce(new Error('DB 오류'))
        .mockResolvedValueOnce([]);

      await expect(
        service.findRelatedContents(496243, 'movie', 6),
      ).rejects.toThrow('DB 오류');
      await expect(
        service.findRelatedContents(496243, 'movie', 6),
      ).resolves.toEqual([]);
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });

    it('1시간이 지난 캐시는 만료되어 다시 조회해야 한다', async () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(1_000);
      mockDataSource.query.mockResolvedValue([]);

      await service.findRelatedContents(496243, 'movie', 6);
      now.mockReturnValue(3_601_001);
      await service.findRelatedContents(496243, 'movie', 6);

      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });

    it('관련 작품 캐시는 최대 500개만 유지해야 한다', () => {
      const cacheAwareService = service as unknown as {
        relatedContentCache: Map<string, unknown>;
        setRelatedContentCache: (
          cacheKey: string,
          relatedContents: unknown[],
        ) => void;
      };

      for (let index = 1; index <= 501; index++) {
        cacheAwareService.setRelatedContentCache(`movie:${index}`, []);
      }

      expect(cacheAwareService.relatedContentCache).toHaveProperty('size', 500);
      expect(cacheAwareService.relatedContentCache.has('movie:1')).toBe(false);
      expect(cacheAwareService.relatedContentCache.has('movie:501')).toBe(true);
    });
  });

  describe('batchCacheByContentIds', () => {
    it('미캐싱 콘텐츠만 캐싱해야 한다', async () => {
      // content_id 1은 이미 캐싱됨, 2는 미캐싱
      mockDataSource.query.mockResolvedValueOnce([{ content_id: 1 }]);

      // cacheContentMetadata 내부: metadataRepo.findOne(null) -> contentRepo.findOne -> description -> embedding -> upsert
      mockMetadataRepo.findOne
        .mockResolvedValueOnce(null) // 캐시 미스
        .mockResolvedValueOnce({ id: 1, contentId: 2, description: '설명' }); // upsert 후 조회
      mockContentRepo.findOne.mockResolvedValue({
        id: 2,
        title: '테스트',
        genres: [],
        overview: '설명',
        credits: [],
        releaseDate: new Date(),
      });
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '설명' } }],
      });
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }],
      });
      mockDataSource.query.mockResolvedValue([]); // upsert 쿼리

      const result = await service.batchCacheByContentIds([1, 2]);

      expect(result.cached).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('이미 캐싱된 콘텐츠만 있으면 모두 스킵해야 한다', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { content_id: 1 },
        { content_id: 2 },
      ]);

      const result = await service.batchCacheByContentIds([1, 2]);

      expect(result.cached).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('캐싱 실패 시 계속 진행해야 한다', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // 아무것도 캐싱 안됨

      // id=1 캐싱 실패, id=2 캐싱 성공
      mockMetadataRepo.findOne
        .mockResolvedValueOnce(null) // id=1 캐시 미스
        .mockResolvedValueOnce(null) // id=2 캐시 미스
        .mockResolvedValueOnce({ id: 1, contentId: 2, description: '설명' }); // id=2 upsert 후 조회

      mockContentRepo.findOne
        .mockResolvedValueOnce({
          id: 1,
          title: '실패작',
          genres: [],
          overview: '설명',
          credits: [],
          releaseDate: new Date(),
        })
        .mockResolvedValueOnce({
          id: 2,
          title: '성공작',
          genres: [],
          overview: '설명',
          credits: [],
          releaseDate: new Date(),
        });

      mockCreate
        .mockRejectedValueOnce(new Error('API 오류')) // id=1 실패
        .mockResolvedValueOnce({ choices: [{ message: { content: '설명' } }] }); // id=2 성공
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }],
      });
      mockDataSource.query.mockResolvedValue([]); // upsert 쿼리

      const result = await service.batchCacheByContentIds([1, 2]);

      expect(result.cached).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('빈 배열을 전달하면 즉시 반환해야 한다', async () => {
      const result = await service.batchCacheByContentIds([]);

      expect(result).toEqual({ cached: 0, skipped: 0, failed: 0 });
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });
});
