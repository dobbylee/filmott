import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmbeddingService, SimilarContent } from './embedding.service';

export interface ContentSearchFilters {
  ottProviderNames?: string[];
  countries?: string[];
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
    const embedding = await this.embeddingService.generateEmbedding(queryText);
    const embeddingStr = `[${embedding.join(',')}]`;
    const excludeIds = excludeTmdbIds.length > 0 ? excludeTmdbIds : [-1];

    const hasFilters = this.hasActiveFilters(filters);

    // 1차: 전체 필터 적용
    let results = await this.executeFilteredSearch(
      embeddingStr, limit, excludeIds, filters,
    );

    // 2차: 결과 부족 시 필터 단계적 완화
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
      (filters.personNames?.length ?? 0) > 0 ||
      (filters.genres?.length ?? 0) > 0 ||
      (filters.dateRange?.from || filters.dateRange?.to) !== undefined &&
      (filters.dateRange?.from || filters.dateRange?.to) !== null ||
      filters.contentType !== undefined
    );
  }

  private async executeFilteredSearch(
    embeddingStr: string,
    limit: number,
    excludeIds: number[],
    filters: ContentSearchFilters,
  ): Promise<SimilarContent[]> {
    const conditions: string[] = [];
    const params: (string | number | number[] | string[])[] = [excludeIds, embeddingStr];
    let paramIndex = 3;

    // OTT 필터
    if (filters.ottProviderNames?.length) {
      conditions.push(
        `AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.watch_providers->'flatrate') AS p WHERE p->>'provider_name' = ANY($${paramIndex}::text[]))`,
      );
      params.push(filters.ottProviderNames);
      paramIndex++;
    }

    // 국가 필터 (정확한 boundary 매칭)
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

    const query = `
WITH filtered AS (
  SELECT c.id, c.tmdb_id, c.content_type, c.title, c.poster_url,
         c.genres, c.vote_average, c.vote_count, c.overview,
         c.director, c.origin_country,
         cm.description,
         EXISTS (
           SELECT 1 FROM rankings r
           WHERE r.content_id = c.id
           AND r.source = 'kobis'
         ) AS is_kobis,
         (cm.content_id IS NOT NULL) AS has_embedding
  FROM contents c
  LEFT JOIN content_metadata cm ON cm.content_id = c.id
  WHERE c.tmdb_id != ALL($1::int[])
    AND (
      c.origin_country LIKE '%KR%'
      OR c.watch_providers IS NOT NULL
      OR EXISTS (SELECT 1 FROM rankings r WHERE r.content_id = c.id AND r.source = 'kobis')
    )
    ${dynamicConditions}
)
SELECT * FROM (
  (SELECT id AS content_id, tmdb_id, content_type, title, poster_url,
          genres, vote_average, vote_count, overview, director, origin_country,
          description, 1 AS priority,
          (1 - (cm_emb.embedding <=> $2::vector)) * 0.7 + LEAST(LN(GREATEST(vote_count, 1) + 1) / 10.0, 0.3) AS score
   FROM filtered
   JOIN content_metadata cm_emb ON cm_emb.content_id = filtered.id
   WHERE has_embedding = true
   ORDER BY score DESC
   LIMIT ${limitParam})

  UNION ALL

  (SELECT id AS content_id, tmdb_id, content_type, title, poster_url,
          genres, vote_average, vote_count, overview, director, origin_country,
          description, 2 AS priority, 0 AS score
   FROM filtered
   WHERE has_embedding = false AND is_kobis = true
   ORDER BY vote_count DESC
   LIMIT ${limitParam})

  UNION ALL

  (SELECT id AS content_id, tmdb_id, content_type, title, poster_url,
          genres, vote_average, vote_count, overview, director, origin_country,
          description, 3 AS priority, 0 AS score
   FROM filtered
   WHERE has_embedding = false AND is_kobis = false
   ORDER BY vote_count DESC
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
