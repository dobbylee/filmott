import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RelatedContentService } from './related-content.service';

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

describe('관련 작품 조회 서비스', () => {
  let service: RelatedContentService;

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
        RelatedContentService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get(RelatedContentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('관련 작품 조회', () => {
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
      const defaultLimit = await service.findRelatedContents(496243, 'movie');

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(6);
      expect(defaultLimit).toEqual(second);
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

  it.each([0, 7, 1.5])(
    'limit=%s를 DB 조회 전에 거부해야 한다',
    async (limit) => {
      await expect(
        service.findRelatedContents(123, 'movie', limit),
      ).rejects.toThrow('limit은 1에서 6 사이의 정수여야 합니다.');
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 20_000_001, 1.5, NaN, Infinity])(
    'ID=%s를 DB 조회 전에 거부해야 한다',
    async (tmdbId) => {
      await expect(
        service.findRelatedContents(tmdbId, 'movie'),
      ).rejects.toThrow('유효하지 않은 TMDB ID입니다.');
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it('지원하지 않는 type을 DB 조회 전에 거부해야 한다', async () => {
    await expect(
      service.findRelatedContents(123, 'anime' as unknown as 'movie' | 'tv'),
    ).rejects.toThrow('type은 "movie" 또는 "tv"만 허용됩니다.');
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });
});
