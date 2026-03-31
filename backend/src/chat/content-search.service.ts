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
  excludeGenres?: string[];
  excludePersonNames?: string[];
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
    precomputedEmbedding?: number[],
  ): Promise<SimilarContent[]> {
    // P0-2: 임베딩 실패 시 null 반환 → 벡터 유사도 없이 2/3순위 결과만 반환
    let embedding: number[] | null = precomputedEmbedding ?? null;
    if (!embedding) {
      try {
        embedding = await this.embeddingService.generateEmbedding(queryText);
      } catch (error) {
        this.logger.warn(
          `임베딩 생성 실패, 벡터 유사도 없이 검색 진행: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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

    // 비선호 장르 제외
    if (filters.excludeGenres?.length) {
      conditions.push(
        `AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.genres) AS g WHERE g->>'name' = ANY($${paramIndex}::text[]))`,
      );
      params.push(filters.excludeGenres);
      paramIndex++;
    }

    // 비선호 감독 제외
    if (filters.excludePersonNames?.length) {
      const excludePersonConditions = filters.excludePersonNames
        .map(() => {
          const idx = paramIndex;
          paramIndex++;
          return `c.director LIKE $${idx}`;
        });
      conditions.push(`AND NOT (${excludePersonConditions.join(' OR ')})`);
      filters.excludePersonNames.forEach((name) => params.push(`%${name}%`));
    }

    params.push(limit);
    const limitParam = `$${paramIndex}`;

    const dynamicConditions = conditions.join('\n       ');

    const buildEmbeddingScore = (embIdx: number): string => {
      return `(1 - (cm.embedding <=> $${embIdx}::vector)) * ${SCORE_WEIGHTS.VECTOR_DEFAULT} + LEAST(LN(GREATEST(c.vote_count, 1) + 1) / 10.0, ${SCORE_WEIGHTS.POPULARITY_DEFAULT})`;
    };

    const popularityOnlyScore = `LEAST(LN(GREATEST(c.vote_count, 1) + 1) / 10.0, ${SCORE_WEIGHTS.POPULARITY_DEFAULT})`;

    // Phase 2: CTE 제거 — content_metadata 기준 1순위 + KOBIS 2순위 UNION ALL
    const query = `
SELECT * FROM (
  -- 1순위: content_metadata 기준 (임베딩 있는 9,633건)
  (SELECT cm.content_id, c.tmdb_id, c.content_type, c.title, c.poster_url,
          c.genres, c.vote_average, c.vote_count, c.overview,
          c.director, c.origin_country,
          cm.description, 1 AS priority,
          ${embeddingParamIndex !== null
    ? buildEmbeddingScore(embeddingParamIndex)
    : popularityOnlyScore
  } AS score
   FROM content_metadata cm
   JOIN contents c ON c.id = cm.content_id
   WHERE c.tmdb_id != ALL($1::int[])
     AND (c.adult IS NOT TRUE)
     AND (c.origin_country LIKE '%KR%' OR c.watch_providers IS NOT NULL
          OR EXISTS (SELECT 1 FROM rankings r WHERE r.content_id = c.id AND r.source = 'kobis'))
     ${dynamicConditions}
   ORDER BY score DESC
   LIMIT ${limitParam})

  UNION ALL

  -- 2순위: KOBIS 랭킹 (content_metadata에 없는 것만)
  (SELECT c.id AS content_id, c.tmdb_id, c.content_type, c.title, c.poster_url,
          c.genres, c.vote_average, c.vote_count, c.overview,
          c.director, c.origin_country,
          NULL::text AS description, 2 AS priority, 0 AS score
   FROM rankings r
   JOIN contents c ON c.id = r.content_id
   WHERE r.source = 'kobis'
     AND c.tmdb_id != ALL($1::int[])
     AND (c.adult IS NOT TRUE)
     AND NOT EXISTS (SELECT 1 FROM content_metadata cm2 WHERE cm2.content_id = c.id)
     ${dynamicConditions}
   ORDER BY c.vote_count DESC
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
