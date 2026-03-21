import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmbeddingService, SimilarContent } from './embedding.service';

export interface ContentSearchFilters {
  ottProviderNames?: string[];
  countries?: string[];
  excludeCountries?: string[];
  personNames?: string[];
  dateRange?: { from: string | null; to: string | null };
  contentType?: 'movie' | 'tv';
  genres?: string[];
}

interface FilteredRow {
  content_id: number;
  tmdb_id: number;
  content_type: string;
  title: string;
  poster_url: string | null;
  genres: { id: number; name: string }[];
  vote_average: number;
  vote_count: number;
  overview: string | null;
  director: string | null;
  origin_country: string | null;
  description: string | null;
  priority: number;
  score: number;
}

const SCORE_WEIGHTS = {
  VECTOR_DEFAULT: 0.7,
  POPULARITY_DEFAULT: 0.3,
} as const;

@Injectable()
export class ContentSearchService {
  private readonly logger = new Logger(ContentSearchService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async searchWithFilters(
    queryText: string,
    limit: number,
    excludeTmdbIds: number[],
    filters: ContentSearchFilters,
  ): Promise<SimilarContent[]> {
    // P0-2: 임베딩 실패 시 null 반환 → 벡터 유사도 없이 2/3순위 결과만 반환
    let embedding: number[] | null = null;
    try {
      embedding = await this.embeddingService.generateEmbedding(queryText);
    } catch (error) {
      this.logger.warn(
        `임베딩 생성 실패, 벡터 유사도 없이 검색 진행: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const embeddingStr = embedding ? `[${embedding.join(',')}]` : null;
    const excludeIds = excludeTmdbIds.length > 0 ? excludeTmdbIds : [-1];

    const hasFilters = this.hasActiveFilters(filters);

    // 1차: 전체 필터 적용
    let results = await this.executeFilteredSearch(
      embeddingStr, limit, excludeIds, filters,
    );

    // 2차: 결과 부족 시 필터 단계적 완화
    // contentType, dateRange는 완화하지 않고 유지 (사용자 의도 보존)
    if (results.length < 5 && hasFilters) {
      const relaxedFilters: ContentSearchFilters = { ...filters };

      if (results.length < 5 && (relaxedFilters.genres?.length ?? 0) > 0) {
        delete relaxedFilters.genres;
        results = await this.executeFilteredSearch(
          embeddingStr, limit, excludeIds, relaxedFilters,
        );
      }

      if (results.length < 5 && (relaxedFilters.personNames?.length ?? 0) > 0) {
        delete relaxedFilters.personNames;
        results = await this.executeFilteredSearch(
          embeddingStr, limit, excludeIds, relaxedFilters,
        );
      }

      if (results.length < 5 && (relaxedFilters.countries?.length ?? 0) > 0) {
        delete relaxedFilters.countries;
        results = await this.executeFilteredSearch(
          embeddingStr, limit, excludeIds, relaxedFilters,
        );
      }

      if (results.length < 5 && (relaxedFilters.ottProviderNames?.length ?? 0) > 0) {
        delete relaxedFilters.ottProviderNames;
        results = await this.executeFilteredSearch(
          embeddingStr, limit, excludeIds, relaxedFilters,
        );
      }
    }

    return results;
  }

  private hasActiveFilters(filters: ContentSearchFilters): boolean {
    return (
      (filters.ottProviderNames?.length ?? 0) > 0 ||
      (filters.countries?.length ?? 0) > 0 ||
      (filters.excludeCountries?.length ?? 0) > 0 ||
      (filters.personNames?.length ?? 0) > 0 ||
      (filters.genres?.length ?? 0) > 0 ||
      !!(filters.dateRange?.from || filters.dateRange?.to) ||
      filters.contentType !== undefined
    );
  }

  // P1-6: 필터 구성 로직은 EmbeddingService와 중복되지만, 쿼리 구조가 다르므로(CTE vs 단일 쿼리)
  // 무리한 추출은 오히려 복잡도를 높인다. 필터 조건 변경 시 양쪽 동기화 필요.
  // 관련: EmbeddingService.searchSimilar()
  private async executeFilteredSearch(
    embeddingStr: string | null,
    limit: number,
    excludeIds: number[],
    filters: ContentSearchFilters,
  ): Promise<SimilarContent[]> {
    const conditions: string[] = [];
    const params: (string | number | number[] | string[])[] = [excludeIds];
    let paramIndex = 2;

    // embeddingStr이 있을 때만 파라미터에 추가
    let embeddingParamIndex: number | null = null;
    if (embeddingStr) {
      params.push(embeddingStr);
      embeddingParamIndex = paramIndex;
      paramIndex++;
    }

    // OTT 필터
    if (filters.ottProviderNames?.length) {
      conditions.push(
        `AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.watch_providers->'flatrate') AS p WHERE p->>'provider_name' = ANY($${paramIndex}::text[]))`,
      );
      params.push(filters.ottProviderNames);
      paramIndex++;
    }

    // 국가 필터 (정확한 boundary 매칭)
    // PostgreSQL `||`는 문자열 연결 연산자 (JavaScript의 OR 연산자와 다름)
    // 예: $3 || ', %' → 'KR, %' (LIKE 패턴으로 "KR, US" 매칭)
    if (filters.countries?.length) {
      const countryConditions = filters.countries
        .map(() => {
          const idx = paramIndex;
          paramIndex++;
          return `(c.origin_country = $${idx} OR c.origin_country LIKE $${idx} || ', %' OR c.origin_country LIKE '%, ' || $${idx} OR c.origin_country LIKE '%, ' || $${idx} || ', %')`;
        });
      conditions.push(`AND (${countryConditions.join(' OR ')})`);
      filters.countries.forEach((country) => params.push(country));
    }

    // 국가 제외 필터 ("외국"/"해외" → KR 제외)
    if (filters.excludeCountries?.length) {
      const excludeConditions = filters.excludeCountries
        .map(() => {
          const idx = paramIndex;
          paramIndex++;
          return `(c.origin_country = $${idx} OR c.origin_country LIKE $${idx} || ', %' OR c.origin_country LIKE '%, ' || $${idx} OR c.origin_country LIKE '%, ' || $${idx} || ', %')`;
        });
      conditions.push(`AND NOT (${excludeConditions.join(' OR ')})`);
      filters.excludeCountries.forEach((country) => params.push(country));
    }

    // 인물 필터
    if (filters.personNames?.length) {
      const personConditions = filters.personNames
        .flatMap(() => {
          const idx = paramIndex;
          const directorCond = `c.director LIKE $${idx}`;
          const creditsCond = `EXISTS (SELECT 1 FROM jsonb_array_elements(c.credits) AS cr WHERE cr->>'name' LIKE $${idx} OR cr->>'character' LIKE $${idx})`;
          paramIndex++;
          return [directorCond, creditsCond];
        });
      conditions.push(`AND (${personConditions.join(' OR ')})`);
      filters.personNames.forEach((name) => params.push(`%${name}%`));
    }

    // contentType 필터
    if (filters.contentType) {
      conditions.push(`AND c.content_type = $${paramIndex}`);
      params.push(filters.contentType);
      paramIndex++;
    }

    // dateRange 필터
    if (filters.dateRange) {
      if (filters.dateRange.from) {
        conditions.push(`AND c.release_date >= $${paramIndex}`);
        params.push(filters.dateRange.from);
        paramIndex++;
      }
      if (filters.dateRange.to) {
        conditions.push(`AND c.release_date <= $${paramIndex}`);
        params.push(filters.dateRange.to);
        paramIndex++;
      }
    }

    // genres 필터
    if (filters.genres?.length) {
      conditions.push(
        `AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.genres) AS g WHERE g->>'name' = ANY($${paramIndex}::text[]))`,
      );
      params.push(filters.genres);
      paramIndex++;
    }

    params.push(limit);
    const limitParam = `$${paramIndex}`;

    const dynamicConditions = conditions.join('\n       ');

    const buildEmbeddingScore = (embIdx: number): string => {
      return `(1 - (embedding <=> $${embIdx}::vector)) * ${SCORE_WEIGHTS.VECTOR_DEFAULT} + LEAST(LN(GREATEST(vote_count, 1) + 1) / 10.0, ${SCORE_WEIGHTS.POPULARITY_DEFAULT})`;
    };

    // P0-2: CTE에서 embedding도 SELECT하여 1순위 블록에서 content_metadata 재조인 제거
    // P1-4: rankings를 LEFT JOIN으로 한 번만 조회 (WHERE + SELECT 이중 서브쿼리 제거)
    const query = `
WITH filtered AS (
  SELECT c.id, c.tmdb_id, c.content_type, c.title, c.poster_url,
         c.genres, c.vote_average, c.vote_count, c.overview,
         c.director, c.origin_country,
         c.watch_providers,
         cm.description,
         cm.embedding,
         (r.id IS NOT NULL) AS is_kobis,
         (cm.content_id IS NOT NULL) AS has_embedding
  FROM contents c
  LEFT JOIN content_metadata cm ON cm.content_id = c.id
  LEFT JOIN rankings r ON r.content_id = c.id AND r.source = 'kobis'
  WHERE c.tmdb_id != ALL($1::int[])
    AND (
      c.origin_country LIKE '%KR%'
      OR c.watch_providers IS NOT NULL
      OR r.id IS NOT NULL
    )
    ${dynamicConditions}
)
SELECT * FROM (
  ${embeddingParamIndex !== null
    ? `-- 1순위: 임베딩 있는 결과 (벡터 유사도 + 인기도 가중 스코어)
  -- 각 우선순위별로 최대 limit개씩 뽑은 뒤 최종 limit개로 자른다
  (SELECT id AS content_id, tmdb_id, content_type, title, poster_url,
          genres, vote_average, vote_count, overview, director, origin_country,
          description, 1 AS priority,
          ${buildEmbeddingScore(embeddingParamIndex)} AS score
   FROM filtered
   WHERE has_embedding = true
   ORDER BY score DESC
   LIMIT ${limitParam})

  UNION ALL

  `
    : ''
  }-- ${embeddingParamIndex !== null ? '2' : '1'}순위: KOBIS 랭킹 작품 (임베딩 없음, 인기도순)
  (SELECT id AS content_id, tmdb_id, content_type, title, poster_url,
          genres, vote_average, vote_count, overview, director, origin_country,
          description, 2 AS priority, 0 AS score
   FROM filtered
   WHERE has_embedding = false AND is_kobis = true
   ORDER BY score DESC, vote_count DESC
   LIMIT ${limitParam})

  UNION ALL

  -- ${embeddingParamIndex !== null ? '3' : '2'}순위: 나머지 (임베딩 없음 + KOBIS 아님, 인기도순)
  (SELECT id AS content_id, tmdb_id, content_type, title, poster_url,
          genres, vote_average, vote_count, overview, director, origin_country,
          description, 3 AS priority, 0 AS score
   FROM filtered
   WHERE has_embedding = false AND is_kobis = false
   ORDER BY score DESC, vote_count DESC
   LIMIT ${limitParam})
) combined
ORDER BY priority, score DESC
LIMIT ${limitParam}`;

    const rows: FilteredRow[] = await this.dataSource.query(query, params);

    return rows.map((row) => ({
      contentId: row.content_id,
      tmdbId: row.tmdb_id,
      contentType: row.content_type,
      title: row.title,
      posterUrl: row.poster_url,
      genres: row.genres || [],
      voteAverage: Number(row.vote_average) || 0,
      description: row.description || row.overview || '',
      similarity: Number(row.score) || 0,
      director: row.director,
      originCountry: row.origin_country,
      overview: row.overview,
    }));
  }
}
