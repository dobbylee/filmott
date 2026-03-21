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

    it('SQL 필터가 전체 contents에서 검색해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      const result = await service.searchWithFilters(
        '스릴러 추천', 20, [],
        { contentType: 'movie' },
      );

      expect(result).toHaveLength(5);
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('스릴러 추천');
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // contents 테이블에서 검색 (content_metadata JOIN이 아닌 LEFT JOIN)
      expect(query).toContain('FROM contents c');
      expect(query).toContain('LEFT JOIN content_metadata cm ON cm.content_id = c.id');
    });

    it('한국 시청 가능 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // KR origin OR watch_providers OR KOBIS
      expect(query).toContain("c.origin_country LIKE '%KR%'");
      expect(query).toContain('c.watch_providers IS NOT NULL');
      expect(query).toContain("r.source = 'kobis'");
    });

    it('3단계 우선순위로 정렬되어야 한다', async () => {
      const mixedRows = [
        { ...baseRow, content_id: 1, priority: 1, score: 0.9, description: '설명1' },
        { ...baseRow, content_id: 2, priority: 1, score: 0.85, description: '설명2' },
        { ...baseRow, content_id: 3, priority: 2, score: 0, description: null, overview: '줄거리3' },
        { ...baseRow, content_id: 4, priority: 3, score: 0, description: null, overview: '줄거리4' },
      ];
      mockDataSource.query.mockResolvedValue(mixedRows);

      const result = await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // UNION ALL로 3단계 분리
      expect(query).toContain('UNION ALL');
      // 우선순위 정렬
      expect(query).toContain('ORDER BY priority, score DESC');
      // 임베딩 있는 결과: description 사용
      expect(result[0].description).toBe('설명1');
      // 임베딩 없는 결과: overview fallback
      expect(result[2].description).toBe('줄거리3');
      expect(result).toHaveLength(4);
    });

    it('OTT 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '넷플릭스 영화', 20, [],
        { ottProviderNames: ['Netflix'] },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain("watch_providers->'flatrate'");
      expect(query).toContain('provider_name');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContainEqual(['Netflix']);
    });

    it('국가 필터가 정확한 boundary 매칭으로 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '한국 영화', 20, [],
        { countries: ['KR'] },
      );

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

      await service.searchWithFilters(
        '봉준호 영화', 20, [],
        { personNames: ['봉준호'] },
      );

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

      await service.searchWithFilters(
        '스릴러 영화', 20, [],
        { genres: ['스릴러', '범죄'] },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('jsonb_array_elements(c.genres)');
      expect(query).toContain("g->>'name'");
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContainEqual(['스릴러', '범죄']);
    });

    it('contentType 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '드라마 추천', 20, [],
        { contentType: 'tv' },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('content_type =');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('tv');
    });

    it('dateRange 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '최신 영화', 20, [],
        { dateRange: { from: '2024-01-01', to: null } },
      );

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

      const result = await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

      expect(result[0].description).toBe('대통령의 음모를 파헤치는 기자의 이야기');
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

      const result = await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

      expect(result[0].description).toBe('');
    });

    it('제외할 tmdbId를 쿼리에 전달해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchWithFilters(
        '테스트', 10, [100, 200],
        { contentType: 'movie' },
      );

      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params[0]).toEqual([100, 200]);
    });

    it('제외 목록이 비어있으면 [-1]로 대체해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.searchWithFilters(
        '테스트', 10, [],
        { contentType: 'movie' },
      );

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
        .mockResolvedValueOnce(twoRows)    // 전체 필터
        .mockResolvedValueOnce(twoRows)    // -genres
        .mockResolvedValueOnce(threeRows)  // -인물
        .mockResolvedValueOnce(fourRows)   // -국가
        .mockResolvedValueOnce(sixRows);   // -OTT

      const result = await service.searchWithFilters(
        '넷플릭스 한국 봉준호 스릴러 영화', 10, [],
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

      await service.searchWithFilters(
        '넷플릭스 한국 영화', 10, [],
        {
          ottProviderNames: ['Netflix'],
          countries: ['KR'],
          genres: ['스릴러'],
        },
      );

      // 1차 쿼리만 실행
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('벡터 유사도 가중 스코어 수식이 쿼리에 포함되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '스릴러 영화', 20, [],
        { contentType: 'movie' },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 가중 스코어 수식 (CTE에서 가져온 embedding 컬럼 직접 사용)
      expect(query).toContain('(1 - (embedding <=> $2::vector)) * 0.7');
      expect(query).toContain('LEAST(LN(GREATEST(vote_count, 1) + 1) / 10.0, 0.3)');
    });

    it('반환 데이터가 SimilarContent 형식으로 매핑되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue([baseRow]);

      const result = await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

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
        '넷플릭스 한국 봉준호 최신 스릴러 영화', 20, [],
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

      await service.searchWithFilters(
        '90년대 이전 영화', 20, [],
        { dateRange: { from: null, to: '1999-12-31' } },
      );

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

      const result = await service.searchWithFilters(
        '드라마 추천', 10, [],
        { contentType: 'tv' },
      );

      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('결과가 0개이면 빈 배열을 반환해야 한다', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.searchWithFilters(
        '존재하지 않는 영화', 10, [],
        { ottProviderNames: ['Netflix'] },
      );

      expect(result).toEqual([]);
    });

    it('복수 국가 필터가 OR 조건으로 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '한국 또는 일본 영화', 20, [],
        { countries: ['KR', 'JP'] },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // 각 국가 조건이 OR로 묶임
      expect(query).toContain('origin_country =');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('KR');
      expect(params).toContain('JP');
    });

    it('복수 인물 필터가 적용되어야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '송강호 최민식 영화', 20, [],
        { personNames: ['송강호', '최민식'] },
      );

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

    it('generateEmbedding 실패 시 벡터 유사도 없이 2/3순위 결과만 반환해야 한다', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error('OpenAI API 오류'),
      );
      mockDataSource.query.mockResolvedValue(fiveRows);

      const result = await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

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

      await service.searchWithFilters(
        '드라마 추천', 20, [],
        { contentType: 'tv', dateRange: { from: '2024-01-01', to: null } },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      expect(query).toContain('content_type =');
      expect(query).toContain('release_date >=');
      const params = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(params).toContain('tv');
      expect(params).toContain('2024-01-01');
    });

    it('CTE에서 rankings LEFT JOIN으로 한 번만 조회해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // LEFT JOIN rankings가 CTE 내에 있어야 한다
      expect(query).toContain('LEFT JOIN rankings r ON r.content_id = c.id');
      // rankings에 대한 EXISTS 서브쿼리가 없어야 한다
      expect(query).not.toContain('EXISTS (');
      expect(query).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+rankings/);
    });

    it('CTE에서 embedding 컬럼을 SELECT하여 재조인 없이 사용해야 한다', async () => {
      mockDataSource.query.mockResolvedValue(fiveRows);

      await service.searchWithFilters(
        '영화 추천', 20, [],
        { contentType: 'movie' },
      );

      const query = mockDataSource.query.mock.calls[0][0] as string;
      // CTE에 embedding이 포함되어야 한다
      expect(query).toContain('cm.embedding');
      // 1순위 블록에서 content_metadata 재조인이 없어야 한다
      expect(query).not.toContain('JOIN content_metadata cm_emb');
    });

    describe('리랭킹 보너스', () => {
      it('preferredGenres가 있으면 장르 보너스 SQL이 포함되어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredGenres: ['드라마', '스릴러'] },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        // 1순위 스코어에 장르 보너스 포함
        expect(query).toContain("jsonb_array_elements(genres)");
        expect(query).toContain("g->>'name'");
        expect(query).toContain('THEN 0.05');
        // 벡터 유사도 가중치 0.6 (리랭킹 활성화)
        expect(query).toContain('* 0.6');
        // 인기도 가중치 0.25 (리랭킹 활성화)
        expect(query).toContain('0.25)');
        // 파라미터에 선호 장르 배열 포함
        const params = mockDataSource.query.mock.calls[0][1] as unknown[];
        expect(params).toContainEqual(['드라마', '스릴러']);
      });

      it('preferredCountries가 있으면 국가 보너스 SQL이 복합값 LIKE 매칭으로 포함되어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredCountries: ['KR', 'JP'] },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        // unnest 기반 복합값 매칭 (origin_country "KR, US"에서도 KR 매칭)
        expect(query).toContain('unnest(');
        expect(query).toContain('origin_country = pc');
        expect(query).toContain("origin_country LIKE pc || ', %'");
        expect(query).toContain('THEN 0.05');
        const params = mockDataSource.query.mock.calls[0][1] as unknown[];
        expect(params).toContainEqual(['KR', 'JP']);
      });

      it('preferredOttNames가 있으면 OTT 보너스 SQL이 포함되어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredOttNames: ['Netflix', 'Tving'] },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        expect(query).toContain("watch_providers->'flatrate'");
        expect(query).toContain("provider_name");
        expect(query).toContain('THEN 0.05');
        const params = mockDataSource.query.mock.calls[0][1] as unknown[];
        expect(params).toContainEqual(['Netflix', 'Tving']);
      });

      it('리랭킹 필드가 없으면 기존 스코어 공식(0.7 + 0.3)을 사용해야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { contentType: 'movie' },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        expect(query).toContain('* 0.7');
        expect(query).toContain('0.3)');
        expect(query).not.toContain('* 0.6');
        expect(query).not.toContain('0.25)');
      });

      it('리랭킹 필드가 빈 배열이면 기존 스코어 공식을 사용해야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredGenres: [], preferredCountries: [], preferredOttNames: [] },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        expect(query).toContain('* 0.7');
        expect(query).toContain('0.3)');
      });

      it('리랭킹 필드만 있고 SQL 필터가 없으면 hasActiveFilters가 false여야 한다', async () => {
        const twoRows = fiveRows.slice(0, 2);
        mockDataSource.query.mockResolvedValue(twoRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredGenres: ['드라마'], preferredCountries: ['KR'] },
        );

        // fallback 쿼리 없이 1회만 실행 (hasActiveFilters = false이므로)
        expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      });

      it('복수 리랭킹 필드가 모두 적용되어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          {
            preferredGenres: ['드라마'],
            preferredCountries: ['KR'],
            preferredOttNames: ['Netflix'],
          },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        // 3가지 보너스 모두 포함
        expect(query).toContain("g->>'name'");
        expect(query).toContain('origin_country = pc');
        expect(query).toContain("p->>'provider_name'");
        // 벡터 유사도 가중치 0.6
        expect(query).toContain('* 0.6');
      });

      it('2/3순위에도 리랭킹 보너스가 적용되어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredGenres: ['드라마'], preferredOttNames: ['Netflix'] },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        // 2/3순위 블록에 보너스 스코어가 포함되어야 한다 (0 AS score가 아닌)
        // KOBIS 블록과 나머지 블록 모두 THEN 0.33 또는 THEN 0.34 보너스
        expect(query).toContain('THEN 0.33');
        expect(query).toContain('THEN 0.34');
        // 2/3순위 ORDER BY에 score DESC 포함
        expect(query).toContain('ORDER BY score DESC, vote_count DESC');
      });

      it('리랭킹 없으면 2/3순위 스코어가 0이어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { contentType: 'movie' },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        // 2순위 블록에 0 AS score
        expect(query).toContain('0 AS score');
      });

      it('SQL WHERE 필터와 리랭킹 필드가 함께 적용되어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '넷플릭스 스릴러', 20, [],
          {
            ottProviderNames: ['Netflix'],
            genres: ['스릴러'],
            preferredGenres: ['드라마', '범죄'],
            preferredCountries: ['KR'],
          },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        // SQL WHERE 필터
        expect(query).toContain("provider_name' = ANY(");
        expect(query).toContain("g->>'name' = ANY(");
        // 리랭킹 보너스
        expect(query).toContain('* 0.6');
        expect(query).toContain('THEN 0.05');
        // 파라미터에 WHERE 필터와 리랭킹 파라미터 모두 포함
        const params = mockDataSource.query.mock.calls[0][1] as unknown[];
        expect(params).toContainEqual(['Netflix']);
        expect(params).toContainEqual(['스릴러']);
        expect(params).toContainEqual(['드라마', '범죄']);
        expect(params).toContainEqual(['KR']);
      });

      it('CTE에 watch_providers 컬럼이 포함되어야 한다', async () => {
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredOttNames: ['Netflix'] },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        expect(query).toContain('c.watch_providers,');
      });

      it('임베딩 실패 시에도 2/3순위에 리랭킹 보너스가 적용되어야 한다', async () => {
        mockEmbeddingService.generateEmbedding.mockRejectedValue(
          new Error('OpenAI API 오류'),
        );
        mockDataSource.query.mockResolvedValue(fiveRows);

        await service.searchWithFilters(
          '영화 추천', 20, [],
          { preferredGenres: ['드라마'], preferredOttNames: ['Netflix'] },
        );

        const query = mockDataSource.query.mock.calls[0][0] as string;
        // 벡터 유사도 블록 없음
        expect(query).not.toContain('<=>');
        // 2/3순위에 리랭킹 보너스 있음
        expect(query).toContain('THEN 0.33');
        expect(query).toContain('THEN 0.34');
      });
    });
  });
});
