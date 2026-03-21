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

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: getRepositoryToken(ContentMetadata), useValue: mockMetadataRepo },
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

  it('정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
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
    it('텍스트를 임베딩 벡터로 변환해야 한다', async () => {
      const mockEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      const result = await service.generateEmbedding('테스트 텍스트');

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: '테스트 텍스트',
      });
    });
  });

  describe('generateDescription', () => {
    it('작품 정보를 기반으로 설명을 생성해야 한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '어두운 분위기의 범죄 스릴러입니다.' } }],
      });

      const content = {
        title: '기생충',
        genres: [{ id: 18, name: '드라마' }, { id: 53, name: '스릴러' }],
        overview: '전원 백수로 살아가는 기택 가족.',
        credits: [{ name: '송강호' }, { name: '이선균' }],
        releaseDate: new Date('2019-05-30'),
      } as Content;

      const result = await service.generateDescription(content);

      expect(result).toBe('어두운 분위기의 범죄 스릴러입니다.');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          max_tokens: 500,
        }),
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
      const existing = { id: 1, contentId: 100, description: '새로운 설명', embedding: '[0.1,0.2,0.3]' };

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

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        [expect.any(String), [100, 200], 10],
      );
    });

    it('제외 목록이 비어있으면 [-1]로 대체해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchSimilar('테스트', 10, []);

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        [expect.any(String), [-1], 10],
      );
    });

    it('필터 없으면 기존과 동일하게 동작해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('테스트', 10, []);

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).not.toContain('watch_providers');
      expect(query).not.toContain('origin_country LIKE');
      expect(query).not.toContain('content_type =');
      expect(query).not.toContain('release_date >=');
    });

    it('OTT 필터가 쿼리에 포함되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('넷플릭스 영화', 10, [], {
        ottProviderNames: ['Netflix'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('watch_providers');
      expect(query).toContain('provider_name');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain(10); // limit
      expect(params).toContainEqual(['Netflix']);
    });

    it('국가 필터가 정확한 boundary 매칭으로 쿼리에 포함되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('한국 영화', 10, [], {
        countries: ['KR'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('origin_country =');
      expect(query).toContain('origin_country LIKE');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      // 정확한 국가 코드가 파라미터로 전달 ('%KR%'가 아닌 'KR')
      expect(params).toContain('KR');
      expect(params).not.toContain('%KR%');
    });

    it('인물 필터가 director LIKE + credits jsonb 검색으로 쿼리에 포함되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('봉준호 영화', 10, [], {
        personNames: ['봉준호'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('director LIKE');
      expect(query).toContain('jsonb_array_elements(c.credits)');
      expect(query).toContain('cr->>\'name\'');
      expect(query).toContain('cr->>\'character\'');
      expect(query).not.toContain('credits::text LIKE');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('%봉준호%');
    });

    it('contentType 필터가 쿼리에 포함되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('드라마 추천', 10, [], {
        contentType: 'tv',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('content_type =');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('tv');
    });

    it('dateRange 필터가 쿼리에 포함되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('최신 영화', 10, [], {
        dateRange: { from: '2024-01-01', to: null },
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('release_date >=');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('2024-01-01');
    });

    it('fallback: 결과 부족 시 필터를 단계적으로 완화해야 한다', async () => {
      // 1차: 전체 필터 → 2개 결과 (부족)
      // 2차: 인물 제거 → 3개 결과 (부족)
      // 3차: 국가 제거 → 4개 결과 (부족)
      // 4차: OTT 제거 → 6개 결과 (충분)
      const twoRows = fiveRows.slice(0, 2);
      const threeRows = fiveRows.slice(0, 3);
      const fourRows = fiveRows.slice(0, 4);
      const sixRows = Array.from({ length: 6 }, (_, i) => ({
        ...mockRow,
        content_id: i + 1,
        tmdb_id: 496243 + i,
        title: `영화${i + 1}`,
      }));

      mockDataSource.query
        .mockResolvedValueOnce(twoRows)    // 전체 필터
        .mockResolvedValueOnce(threeRows)  // -인물
        .mockResolvedValueOnce(fourRows)   // -국가
        .mockResolvedValueOnce(sixRows);   // -OTT

      const result = await service.searchSimilar('넷플릭스 한국 봉준호 영화', 10, [], {
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        personNames: ['봉준호'],
      });

      // 4번의 쿼리가 실행되어야 한다
      expect(mockDataSource.query).toHaveBeenCalledTimes(4);
      expect(result).toHaveLength(6);

      // 임베딩은 1회만 생성해야 한다
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);

      // 1차 쿼리: 모든 필터 포함
      const firstQuery = mockDataSource.query.mock.calls[0][0] as string;
      expect(firstQuery).toContain('provider_name');
      expect(firstQuery).toContain('origin_country LIKE');
      expect(firstQuery).toContain('director LIKE');

      // 2차 쿼리: 인물 필터 제거
      const secondQuery = mockDataSource.query.mock.calls[1][0] as string;
      expect(secondQuery).toContain('provider_name');
      expect(secondQuery).toContain('origin_country LIKE');
      expect(secondQuery).not.toContain('director LIKE');

      // 3차 쿼리: 국가 필터 제거
      const thirdQuery = mockDataSource.query.mock.calls[2][0] as string;
      expect(thirdQuery).toContain('provider_name');
      expect(thirdQuery).not.toContain('origin_country LIKE');

      // 4차 쿼리: OTT 필터 제거
      const fourthQuery = mockDataSource.query.mock.calls[3][0] as string;
      expect(fourthQuery).not.toContain('provider_name');
    });

    it('dateRange가 null이면 hasFilters에서 제외되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue([mockRow]);

      await service.searchSimilar('테스트', 10, [], {
        dateRange: { from: null, to: null },
      });

      // dateRange가 null/null이면 필터로 간주하지 않음 → fallback 미실행
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('fallback: 결과가 충분하면 추가 쿼리를 실행하지 않아야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchSimilar('넷플릭스 한국 영화', 10, [], {
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
      });

      // 1차 쿼리만 실행
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('batchCacheMetadata', () => {
    it('조건에 맞는 콘텐츠를 배치 캐싱해야 한다', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 1 },
          { id: 2 },
        ]),
      };
      mockContentRepo.createQueryBuilder.mockReturnValue(mockQb);

      const metadataQb = {
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { contentId: 1 },
        ]),
      };
      mockMetadataRepo.createQueryBuilder.mockReturnValue(metadataQb);

      // id=1은 이미 캐싱됨, id=2만 캐싱
      mockMetadataRepo.findOne.mockResolvedValue(null);
      const content = {
        id: 2,
        title: '테스트',
        genres: [],
        overview: '설명',
        credits: [],
        releaseDate: new Date(),
      } as unknown as Content;
      mockContentRepo.findOne.mockResolvedValue(content);

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '설명' } }],
      });
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }],
      });

      const metadata = { id: 1, contentId: 2, description: '설명' };
      mockMetadataRepo.create.mockReturnValue(metadata);
      mockMetadataRepo.save.mockResolvedValue(metadata);

      const result = await service.batchCacheMetadata({
        minVoteCount: 1000,
        minReleaseDate: null,
      });

      expect(result.cached).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('캐싱 실패 시 에러를 무시하고 계속 진행해야 한다', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 1 },
        ]),
      };
      mockContentRepo.createQueryBuilder.mockReturnValue(mockQb);

      const metadataQb = {
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockMetadataRepo.createQueryBuilder.mockReturnValue(metadataQb);

      // cacheContentMetadata가 실패하도록 설정
      mockMetadataRepo.findOne.mockResolvedValue(null);
      mockContentRepo.findOne.mockResolvedValue({
        id: 1,
        title: '테스트',
        genres: [],
        overview: '설명',
        credits: [],
        releaseDate: new Date(),
      });

      mockCreate.mockRejectedValue(new Error('API 오류'));

      const result = await service.batchCacheMetadata({
        minVoteCount: 1000,
        minReleaseDate: null,
      });

      expect(result.failed).toBe(1);
      expect(result.cached).toBe(0);
    });
  });
});
