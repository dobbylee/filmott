import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ContentSearchService } from './content-search.service';
import { EmbeddingService } from './embedding.service';

describe('ContentSearchService', () => {
  let service: ContentSearchService;

  const mockEmbeddingService = {
    generateEmbedding: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn(),
  };

  const mockEmbedding = [0.1, 0.2, 0.3];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentSearchService,
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ContentSearchService>(ContentSearchService);

    mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  describe('searchWithFilters', () => {
    const baseRow = {
      content_id: 1,
      tmdb_id: 496243,
      content_type: 'movie',
      title: '기생충',
      poster_url: '/poster.jpg',
      genres: [{ id: 18, name: '드라마' }],
      vote_average: 8.6,
      vote_count: 10000,
      overview: '전원 백수로 살아가는 기택 가족.',
      director: '봉준호',
      origin_country: 'KR',
      description: '어두운 분위기의 사회 풍자 스릴러',
      priority: 1,
      score: 0.85,
    };

    const fiveRows = Array.from({ length: 5 }, (_, i) => ({
      ...baseRow,
      content_id: i + 1,
      tmdb_id: 496243 + i,
      title: `영화${i + 1}`,
    }));

    it('1순위가 content_metadata 기준으로 검색해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      const result = await service.searchWithFilters('스릴러 추천', 20, [], {
        contentType: 'movie',
      });

      expect(result).toHaveLength(5);
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        '스릴러 추천',
      );
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 1순위: content_metadata 기준 JOIN
      expect(query).toContain('FROM content_metadata cm');
      expect(query).toContain('JOIN contents c ON c.id = cm.content_id');
    });

    it('adult 콘텐츠를 검색 결과에서 제외해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('c.adult IS NOT TRUE');
    });

    it('한국 시청 가능 필터가 1순위 블록에 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 1순위 블록: KR origin OR watch_providers OR KOBIS EXISTS
      expect(query).toContain("c.origin_country LIKE '%KR%'");
      expect(query).toContain('c.watch_providers IS NOT NULL');
      expect(query).toContain("r.source = 'kobis'");
    });

    it('2단계 우선순위로 정렬되어야 한다', async () => {
      const mixedRows = [
        {
          ...baseRow,
          content_id: 1,
          priority: 1,
          score: 0.9,
          description: '설명1',
        },
        {
          ...baseRow,
          content_id: 2,
          priority: 1,
          score: 0.85,
          description: '설명2',
        },
        {
          ...baseRow,
          content_id: 3,
          priority: 2,
          score: 0,
          description: null,
          overview: '줄거리3',
        },
      ];
      mockDataSource.query.mockResolvedValue(mixedRows);

      const result = await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // UNION ALL로 2단계 분리 (1순위 content_metadata + 2순위 KOBIS)
      const unionCount = (query.match(/UNION ALL/g) || []).length;
      expect(unionCount).toBe(1);
      // 우선순위 정렬
      expect(query).toContain('ORDER BY priority, score DESC');
      // 1순위: description 사용
      expect(result[0].description).toBe('설명1');
      // 2순위: overview fallback
      expect(result[2].description).toBe('줄거리3');
      expect(result).toHaveLength(3);
    });

    it('OTT 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('넷플릭스 영화', 20, [], {
        ottProviderNames: ['Netflix'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain("watch_providers->'flatrate'");
      expect(query).toContain('provider_name');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContainEqual(['Netflix']);
    });

    it('국가 필터가 정확한 boundary 매칭으로 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('한국 영화', 20, [], {
        countries: ['KR'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('origin_country =');
      expect(query).toContain('origin_country LIKE');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      // 정확한 국가 코드 ('KR')가 파라미터로 전달
      expect(params).toContain('KR');
      expect(params).not.toContain('%KR%');
    });

    it('인물 필터가 director + credits jsonb 검색으로 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('봉준호 영화', 20, [], {
        personNames: ['봉준호'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('director LIKE');
      expect(query).toContain('jsonb_array_elements(c.credits)');
      expect(query).toContain("cr->>'name'");
      expect(query).toContain("cr->>'character'");
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('%봉준호%');
    });

    it('genres 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('스릴러 영화', 20, [], {
        genres: ['스릴러', '범죄'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('jsonb_array_elements(c.genres)');
      expect(query).toContain("g->>'name'");
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContainEqual(['스릴러', '범죄']);
    });

    it('contentType 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('드라마 추천', 20, [], {
        contentType: 'tv',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('content_type =');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('tv');
    });

    it('dateRange 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('최신 영화', 20, [], {
        dateRange: { from: '2024-01-01', to: null },
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('release_date >=');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('2024-01-01');
    });

    it('임베딩 없는 결과에 overview가 description으로 포함되어야 한다', async () => {
      const rowWithoutEmbedding = {
        ...baseRow,
        description: null,
        overview: '대통령의 음모를 파헤치는 기자의 이야기',
        priority: 2,
        score: 0,
      };
      mockDataSource.query.mockResolvedValue([rowWithoutEmbedding]);

      const result = await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      expect(result[0].description).toBe(
        '대통령의 음모를 파헤치는 기자의 이야기',
      );
      expect(result[0].overview).toBe('대통령의 음모를 파헤치는 기자의 이야기');
    });

    it('description과 overview 모두 없으면 빈 문자열이어야 한다', async () => {
      const rowWithoutBoth = {
        ...baseRow,
        description: null,
        overview: null,
        priority: 3,
        score: 0,
      };
      mockDataSource.query.mockResolvedValue([rowWithoutBoth]);

      const result = await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      expect(result[0].description).toBe('');
    });

    it('제외할 tmdbId를 쿼리에 전달해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchWithFilters('테스트', 10, [100, 200], {
        contentType: 'movie',
      });

      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[0]).toEqual([100, 200]);
    });

    it('제외 목록이 비어있으면 [-1]로 대체해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchWithFilters('테스트', 10, [], {
        contentType: 'movie',
      });

      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[0]).toEqual([-1]);
    });

    it('fallback: 결과 부족 시 필터를 단계적으로 완화해야 한다', async () => {
      const twoRows = fiveRows.slice(0, 2);
      const threeRows = fiveRows.slice(0, 3);
      const fourRows = fiveRows.slice(0, 4);
      const sixRows = Array.from({ length: 6 }, (_, i) => ({
        ...baseRow,
        content_id: i + 1,
        tmdb_id: 496243 + i,
        title: `영화${i + 1}`,
      }));

      mockDataSource.query
        .mockResolvedValueOnce(twoRows) // 전체 필터
        .mockResolvedValueOnce(twoRows) // -genres
        .mockResolvedValueOnce(threeRows) // -인물
        .mockResolvedValueOnce(fourRows) // -국가
        .mockResolvedValueOnce(sixRows); // -OTT

      const result = await service.searchWithFilters(
        '넷플릭스 한국 봉준호 스릴러 영화',
        10,
        [],
        {
          ottProviderNames: ['Netflix'],
          countries: ['KR'],
          personNames: ['봉준호'],
          genres: ['스릴러'],
        },
      );

      // 5번의 쿼리가 실행되어야 한다 (전체 → -genres → -인물 → -국가 → -OTT)
      expect(mockDataSource.query).toHaveBeenCalledTimes(5);
      expect(result).toHaveLength(6);

      // 임베딩은 1회만 생성
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);

      // 1차 쿼리: 모든 필터 포함
      const firstQuery = mockDataSource.query.mock.calls[0][0] as string;
      expect(firstQuery).toContain('provider_name');
      expect(firstQuery).toContain('origin_country =');
      expect(firstQuery).toContain('director LIKE');
      expect(firstQuery).toContain("g->>'name'");

      // 2차 쿼리: genres 제거
      const secondQuery = mockDataSource.query.mock.calls[1][0] as string;
      expect(secondQuery).toContain('provider_name');
      expect(secondQuery).toContain('origin_country =');
      expect(secondQuery).toContain('director LIKE');
      expect(secondQuery).not.toContain("g->>'name'");

      // 3차 쿼리: 인물 제거
      const thirdQuery = mockDataSource.query.mock.calls[2][0] as string;
      expect(thirdQuery).toContain('provider_name');
      expect(thirdQuery).toContain('origin_country =');
      expect(thirdQuery).not.toContain('director LIKE');

      // 4차 쿼리: 국가 제거
      const fourthQuery = mockDataSource.query.mock.calls[3][0] as string;
      expect(fourthQuery).toContain('provider_name');
      expect(fourthQuery).not.toContain('origin_country =');

      // 5차 쿼리: OTT 제거
      const fifthQuery = mockDataSource.query.mock.calls[4][0] as string;
      expect(fifthQuery).not.toContain('provider_name');
    });

    it('fallback: 결과가 충분하면 추가 쿼리를 실행하지 않아야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('넷플릭스 한국 영화', 10, [], {
        ottProviderNames: ['Netflix'],
        countries: ['KR'],
        genres: ['스릴러'],
      });

      // 1차 쿼리만 실행
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('벡터 유사도 가중 스코어 수식이 쿼리에 포함되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('스릴러 영화', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 가중 스코어 수식 (content_metadata의 embedding 컬럼 직접 사용)
      expect(query).toContain('(1 - (cm.embedding <=> $2::vector)) * 0.7');
      expect(query).toContain(
        'LEAST(LN(GREATEST(c.vote_count, 1) + 1) / 10.0, 0.3)',
      );
    });

    it('반환 데이터가 SimilarContent 형식으로 매핑되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue([baseRow]);

      const result = await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      expect(result[0]).toEqual({
        contentId: 1,
        tmdbId: 496243,
        contentType: 'movie',
        title: '기생충',
        posterUrl: '/poster.jpg',
        genres: [{ id: 18, name: '드라마' }],
        voteAverage: 8.6,
        description: '어두운 분위기의 사회 풍자 스릴러',
        similarity: 0.85,
        director: '봉준호',
        originCountry: 'KR',
        overview: '전원 백수로 살아가는 기택 가족.',
      });
    });

    it('복합 필터가 모두 동시에 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '넷플릭스 한국 봉준호 최신 스릴러 영화',
        20,
        [],
        {
          ottProviderNames: ['Netflix'],
          countries: ['KR'],
          personNames: ['봉준호'],
          dateRange: { from: '2020-01-01', to: '2026-12-31' },
          contentType: 'movie',
          genres: ['스릴러'],
        },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('provider_name');
      expect(query).toContain('origin_country =');
      expect(query).toContain('director LIKE');
      expect(query).toContain('content_type =');
      expect(query).toContain('release_date >=');
      expect(query).toContain('release_date <=');
      expect(query).toContain("g->>'name'");
    });

    it('dateRange.to만 있으면 release_date <= 조건만 생성해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('90년대 이전 영화', 20, [], {
        dateRange: { from: null, to: '1999-12-31' },
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('release_date <=');
      expect(query).not.toContain('release_date >=');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('1999-12-31');
    });

    it('contentType만 필터인 경우 fallback 없이 단일 쿼리를 실행해야 한다', async () => {
      // contentType은 완화 단계에 없으므로 결과가 부족해도 추가 쿼리 없음
      const twoRows = fiveRows.slice(0, 2);
      mockDataSource.query.mockResolvedValue(twoRows);

      const result = await service.searchWithFilters('드라마 추천', 10, [], {
        contentType: 'tv',
      });

      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('결과가 0개이면 빈 배열을 반환해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.searchWithFilters(
        '존재하지 않는 영화',
        10,
        [],
        { ottProviderNames: ['Netflix'] },
      );

      expect(result).toEqual([]);
    });

    it('복수 국가 필터가 OR 조건으로 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('한국 또는 일본 영화', 20, [], {
        countries: ['KR', 'JP'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 각 국가 조건이 OR로 묶임
      expect(query).toContain('origin_country =');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('KR');
      expect(params).toContain('JP');
    });

    it('복수 인물 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('송강호 최민식 영화', 20, [], {
        personNames: ['송강호', '최민식'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('director LIKE');
      expect(query).toContain('jsonb_array_elements(c.credits)');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('%송강호%');
      expect(params).toContain('%최민식%');
    });

    it('필터 없이 호출하면 fallback 없이 단일 쿼리를 실행해야 한다', async () => {
      const twoRows = fiveRows.slice(0, 2);
      mockDataSource.query.mockResolvedValue(twoRows);

      await service.searchWithFilters('영화 추천', 10, [], {});

      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('generateEmbedding 실패 시 벡터 유사도 없이 인기도 기반 결과를 반환해야 한다', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error('OpenAI API 오류'),
      );
      mockDataSource.query.mockResolvedValue(fiveRows);

      const result = await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      expect(result).toHaveLength(5);
      // 쿼리에 벡터 유사도 블록이 없어야 한다
      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).not.toContain('<=>');
      expect(query).not.toContain('::vector');
      // embedding 파라미터가 없어야 한다
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      const hasEmbeddingParam = params.some(
        (p) => typeof p === 'string' && p.startsWith('[0.'),
      );
      expect(hasEmbeddingParam).toBe(false);
    });

    it('generateEmbedding 실패 시에도 contentType 필터가 유지되어야 한다', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error('OpenAI API 오류'),
      );
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('드라마 추천', 20, [], {
        contentType: 'tv',
        dateRange: { from: '2024-01-01', to: null },
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('content_type =');
      expect(query).toContain('release_date >=');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('tv');
      expect(params).toContain('2024-01-01');
    });

    it('2순위에서 rankings를 직접 JOIN으로 조회해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 2순위: FROM rankings r JOIN contents c
      expect(query).toContain('FROM rankings r');
      expect(query).toContain('JOIN contents c ON c.id = r.content_id');
    });

    it('precomputedEmbedding이 있으면 generateEmbedding을 호출하지 않아야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);
      const precomputed = [0.5, 0.6, 0.7];

      await service.searchWithFilters(
        '영야성하 비슷한 드라마',
        20,
        [],
        { contentType: 'tv' },
        precomputed,
      );

      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      // precomputedEmbedding이 쿼리 파라미터에 포함되어야 한다
      expect(params).toContain('[0.5,0.6,0.7]');
    });

    it('precomputedEmbedding이 없으면 generateEmbedding을 호출해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('스릴러 추천', 20, [], {
        contentType: 'movie',
      });

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        '스릴러 추천',
      );
    });

    it('1순위 블록에서 content_metadata를 직접 조인하여 재조인이 불필요해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 1순위: FROM content_metadata cm 직접 시작
      expect(query).toContain('FROM content_metadata cm');
      // cm.embedding 직접 참조
      expect(query).toContain('cm.embedding');
      // 별도 재조인 없음
      expect(query).not.toContain('JOIN content_metadata cm_emb');
    });

    it('2순위 KOBIS 결과에서 content_metadata에 이미 있는 작품을 제외해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 2순위 블록에 NOT EXISTS로 content_metadata 중복 제거
      expect(query).toContain(
        'NOT EXISTS (SELECT 1 FROM content_metadata cm2 WHERE cm2.content_id = c.id)',
      );
    });

    it('excludeGenres 필터가 SQL에 NOT EXISTS 조건으로 생성되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        excludeGenres: ['공포', '스릴러'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('NOT EXISTS');
      expect(query).toContain("g->>'name'");
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContainEqual(['공포', '스릴러']);
    });

    it('excludePersonNames 필터가 SQL에 NOT (director LIKE) 조건으로 생성되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        excludePersonNames: ['감독A'],
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('AND NOT (');
      expect(query).toContain('director LIKE');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('%감독A%');
    });

    it('임베딩 실패 시 1순위에서 인기도 기반으로 정렬해야 한다', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error('OpenAI API 오류'),
      );
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters('영화 추천', 20, [], {
        contentType: 'movie',
      });

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 벡터 유사도 없이 인기도만 사용
      expect(query).not.toContain('<=>');
      expect(query).not.toContain('::vector');
      // 1순위 블록이 여전히 content_metadata 기준
      expect(query).toContain('FROM content_metadata cm');
      // 인기도 점수가 score로 사용
      expect(query).toContain(
        'LEAST(LN(GREATEST(c.vote_count, 1) + 1) / 10.0, 0.3)',
      );
    });
  });
});
