import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildSearchIndexableContentSql } from '../contents/search-indexable-content';

const MAX_TMDB_ID = 20_000_000;
const RELATED_CONTENT_QUERY_TIMEOUT_MS = 5_000;
const RELATED_CONTENT_CACHE_TTL_MS = 60 * 60 * 1000;
const RELATED_CONTENT_CACHE_MAX_ENTRIES = 500;
const RELATED_CONTENT_RESULT_LIMIT = 6;
const RELATED_FRESH_POOL_SIZE = 600;
const RELATED_POPULAR_POOL_SIZE = 600;
const RELATED_FRESH_SLOT_LIMIT = 2;
const RELATED_POPULAR_FETCH_LIMIT = 12;

export interface RelatedContent {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  posterUrl: string;
  releaseDate: string;
  voteAverage: number;
}

interface RelatedContentRow {
  tmdb_id: number;
  content_type: 'movie' | 'tv';
  title: string;
  poster_url: string;
  release_date: string;
  vote_average: number;
}

interface RelatedContentSourceRow {
  content_id: number;
  genres: unknown;
  embedding: string | null;
}

interface RelatedContentCacheEntry {
  data: RelatedContent[];
  expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRelatedContentRows(value: unknown): RelatedContentRow[] {
  if (!Array.isArray(value)) {
    throw new Error('관련 작품 조회 결과 형식이 올바르지 않습니다.');
  }

  return value.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.tmdb_id !== 'number' ||
      !Number.isSafeInteger(row.tmdb_id) ||
      row.tmdb_id <= 0 ||
      (row.content_type !== 'movie' && row.content_type !== 'tv') ||
      typeof row.title !== 'string' ||
      row.title.trim().length === 0 ||
      typeof row.poster_url !== 'string' ||
      row.poster_url.length === 0 ||
      typeof row.release_date !== 'string' ||
      row.release_date.length === 0 ||
      typeof row.vote_average !== 'number' ||
      !Number.isFinite(row.vote_average)
    ) {
      throw new Error('관련 작품 조회 결과 형식이 올바르지 않습니다.');
    }

    return {
      tmdb_id: row.tmdb_id,
      content_type: row.content_type,
      title: row.title.trim(),
      poster_url: row.poster_url,
      release_date: row.release_date,
      vote_average: row.vote_average,
    };
  });
}

function parseGenreIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const genreIds = new Set<number>();
  for (const genre of value as unknown[]) {
    if (
      isRecord(genre) &&
      typeof genre.id === 'number' &&
      Number.isSafeInteger(genre.id) &&
      genre.id > 0
    ) {
      genreIds.add(genre.id);
    }
  }
  return [...genreIds];
}

function parseRelatedContentSourceRow(
  value: unknown,
): RelatedContentSourceRow | null {
  if (!Array.isArray(value)) {
    throw new Error('기준 작품 조회 결과 형식이 올바르지 않습니다.');
  }
  if (value.length === 0) return null;

  const rows = value as unknown[];
  const row = rows[0];
  if (
    !isRecord(row) ||
    typeof row.content_id !== 'number' ||
    !Number.isSafeInteger(row.content_id) ||
    row.content_id <= 0 ||
    !('genres' in row) ||
    (row.embedding !== null &&
      (typeof row.embedding !== 'string' || row.embedding.length === 0))
  ) {
    throw new Error('기준 작품 조회 결과 형식이 올바르지 않습니다.');
  }

  return {
    content_id: row.content_id,
    genres: row.genres,
    embedding: row.embedding,
  };
}

@Injectable()
export class RelatedContentService {
  private readonly relatedContentCache = new Map<
    string,
    RelatedContentCacheEntry
  >();
  private readonly relatedContentInFlight = new Map<
    string,
    Promise<RelatedContent[]>
  >();

  constructor(private readonly dataSource: DataSource) {}

  async findRelatedContents(
    tmdbId: number,
    contentType: 'movie' | 'tv',
    limit = 6,
  ): Promise<RelatedContent[]> {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || tmdbId > MAX_TMDB_ID) {
      throw new BadRequestException('유효하지 않은 TMDB ID입니다.');
    }
    if (contentType !== 'movie' && contentType !== 'tv') {
      throw new BadRequestException('type은 "movie" 또는 "tv"만 허용됩니다.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 6) {
      throw new BadRequestException('limit은 1에서 6 사이의 정수여야 합니다.');
    }

    const cacheKey = `${contentType}:${tmdbId}`;
    const cached = this.getCachedRelatedContents(cacheKey);
    if (cached !== null) return cached.slice(0, limit);

    let inFlight = this.relatedContentInFlight.get(cacheKey);
    if (!inFlight) {
      inFlight = this.loadRelatedContents(tmdbId, contentType)
        .then((relatedContents) => {
          this.setRelatedContentCache(cacheKey, relatedContents);
          return relatedContents;
        })
        .finally(() => {
          this.relatedContentInFlight.delete(cacheKey);
        });
      this.relatedContentInFlight.set(cacheKey, inFlight);
    }

    return (await inFlight).slice(0, limit);
  }

  private getCachedRelatedContents(cacheKey: string): RelatedContent[] | null {
    const cached = this.relatedContentCache.get(cacheKey);
    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
      this.relatedContentCache.delete(cacheKey);
      return null;
    }

    this.relatedContentCache.delete(cacheKey);
    this.relatedContentCache.set(cacheKey, cached);
    return [...cached.data];
  }

  private setRelatedContentCache(
    cacheKey: string,
    relatedContents: RelatedContent[],
  ): void {
    this.relatedContentCache.delete(cacheKey);
    while (this.relatedContentCache.size >= RELATED_CONTENT_CACHE_MAX_ENTRIES) {
      const oldestKey = this.relatedContentCache.keys().next().value as
        | string
        | undefined;
      if (oldestKey === undefined) break;
      this.relatedContentCache.delete(oldestKey);
    }
    this.relatedContentCache.set(cacheKey, {
      data: [...relatedContents],
      expiresAt: Date.now() + RELATED_CONTENT_CACHE_TTL_MS,
    });
  }

  private async loadRelatedContents(
    tmdbId: number,
    contentType: 'movie' | 'tv',
  ): Promise<RelatedContent[]> {
    const sourceIndexability = buildSearchIndexableContentSql({
      contentAlias: 'source_content',
      minVoteCountPlaceholder: '$3',
      signalSource: { kind: 'exists' },
    });
    const freshIndexability = buildSearchIndexableContentSql({
      contentAlias: 'c',
      minVoteCountPlaceholder: '$5',
      signalSource: { kind: 'exists' },
    });
    const vectorIndexability = buildSearchIndexableContentSql({
      contentAlias: 'c',
      minVoteCountPlaceholder: '$2',
      signalSource: { kind: 'exists' },
    });
    const popularIndexability = buildSearchIndexableContentSql({
      contentAlias: 'c',
      minVoteCountPlaceholder: '$5',
      signalSource: { kind: 'exists' },
    });
    const sourceQuery = `SELECT source_content.id AS content_id,
           source_content.genres AS genres,
           source_metadata.embedding::text AS embedding
    FROM contents source_content
    LEFT JOIN content_metadata source_metadata
      ON source_metadata.content_id = source_content.id
    WHERE source_content.tmdb_id = $1
      AND source_content.content_type = $2
      AND ${sourceIndexability.predicate}
    LIMIT 1`;
    const freshQuery = `
    WITH recent_pool AS MATERIALIZED (
      SELECT recent.id
      FROM contents recent
      WHERE recent.release_date IS NOT NULL
        AND recent.release_date <= CURRENT_DATE
      ORDER BY recent.release_date DESC
      LIMIT $1
    )
    SELECT c.tmdb_id,
           c.content_type,
           c.title,
           c.poster_url,
           TO_CHAR(c.release_date, 'YYYY-MM-DD') AS release_date,
           COALESCE(c.vote_average, 0)::float8 AS vote_average
    FROM recent_pool
    JOIN contents c ON c.id = recent_pool.id
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS overlap_count
      FROM jsonb_array_elements(COALESCE(c.genres, '[]'::jsonb)) genre
      WHERE (genre ->> 'id') ~ '^[0-9]+$'
        AND (genre ->> 'id')::int = ANY($4::int[])
    ) genre_match
    WHERE c.id <> $2
      AND c.content_type = $3
      AND genre_match.overlap_count > 0
      AND NOT EXISTS (
        SELECT 1
        FROM content_metadata fresh_metadata
        WHERE fresh_metadata.content_id = c.id
      )
      AND ${freshIndexability.predicate}
    ORDER BY genre_match.overlap_count DESC,
             c.release_date DESC,
             c.vote_count DESC,
             c.id DESC
    LIMIT $6`;
    const vectorQuery = `
    SELECT c.tmdb_id,
           c.content_type,
           c.title,
           c.poster_url,
           TO_CHAR(c.release_date, 'YYYY-MM-DD') AS release_date,
           COALESCE(c.vote_average, 0)::float8 AS vote_average
    FROM content_metadata cm
    JOIN contents c ON c.id = cm.content_id
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS overlap_count
      FROM jsonb_array_elements(COALESCE(c.genres, '[]'::jsonb)) genre
      WHERE (genre ->> 'id') ~ '^[0-9]+$'
        AND (genre ->> 'id')::int = ANY($6::int[])
    ) genre_match
    WHERE cm.content_id <> $4
      AND c.content_type = $5
      AND genre_match.overlap_count > 0
      AND ${vectorIndexability.predicate}
    ORDER BY cm.embedding <=> $1::vector
    LIMIT $3`;
    const popularQuery = `
    WITH popular_pool AS MATERIALIZED (
      SELECT popular.id
      FROM contents popular
      ORDER BY popular.vote_count DESC
      LIMIT $1
    )
    SELECT c.tmdb_id,
           c.content_type,
           c.title,
           c.poster_url,
           TO_CHAR(c.release_date, 'YYYY-MM-DD') AS release_date,
           COALESCE(c.vote_average, 0)::float8 AS vote_average
    FROM popular_pool
    JOIN contents c ON c.id = popular_pool.id
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::int AS overlap_count
      FROM jsonb_array_elements(COALESCE(c.genres, '[]'::jsonb)) genre
      WHERE (genre ->> 'id') ~ '^[0-9]+$'
        AND (genre ->> 'id')::int = ANY($4::int[])
    ) genre_match
    WHERE c.id <> $2
      AND c.content_type = $3
      AND genre_match.overlap_count > 0
      AND EXISTS (
        SELECT 1
        FROM content_metadata popular_metadata
        WHERE popular_metadata.content_id = c.id
      )
      AND ${popularIndexability.predicate}
    ORDER BY genre_match.overlap_count DESC,
             c.vote_count DESC,
             c.release_date DESC,
             c.id DESC
    LIMIT $6`;

    const rows = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('statement_timeout', $1, true)`, [
        `${RELATED_CONTENT_QUERY_TIMEOUT_MS}ms`,
      ]);
      await manager.query(
        `SELECT set_config('hnsw.iterative_scan', 'strict_order', true)`,
      );
      const sourceResult: unknown = await manager.query(sourceQuery, [
        tmdbId,
        contentType,
        sourceIndexability.minVoteCount,
      ]);
      const source = parseRelatedContentSourceRow(sourceResult);
      if (!source) return [];

      const genreIds = parseGenreIds(source.genres);
      if (genreIds.length === 0) return [];

      const freshResult: unknown = await manager.query(freshQuery, [
        RELATED_FRESH_POOL_SIZE,
        source.content_id,
        contentType,
        genreIds,
        freshIndexability.minVoteCount,
        RELATED_FRESH_SLOT_LIMIT,
      ]);
      const freshRows = parseRelatedContentRows(freshResult);
      const establishedLimit = RELATED_CONTENT_RESULT_LIMIT - freshRows.length;
      const establishedRows: RelatedContentRow[] = [];

      if (source.embedding !== null && establishedLimit > 0) {
        const vectorResult: unknown = await manager.query(vectorQuery, [
          source.embedding,
          vectorIndexability.minVoteCount,
          establishedLimit,
          source.content_id,
          contentType,
          genreIds,
        ]);
        establishedRows.push(...parseRelatedContentRows(vectorResult));
      }

      if (establishedRows.length < establishedLimit) {
        const popularResult: unknown = await manager.query(popularQuery, [
          RELATED_POPULAR_POOL_SIZE,
          source.content_id,
          contentType,
          genreIds,
          popularIndexability.minVoteCount,
          RELATED_POPULAR_FETCH_LIMIT,
        ]);
        const seen = new Set(
          establishedRows.map((row) => `${row.content_type}:${row.tmdb_id}`),
        );
        for (const row of parseRelatedContentRows(popularResult)) {
          const key = `${row.content_type}:${row.tmdb_id}`;
          if (seen.has(key)) continue;
          establishedRows.push(row);
          seen.add(key);
          if (establishedRows.length >= establishedLimit) break;
        }
      }

      return [...establishedRows, ...freshRows].slice(
        0,
        RELATED_CONTENT_RESULT_LIMIT,
      );
    });

    return rows.map((row) => ({
      tmdbId: row.tmdb_id,
      contentType: row.content_type,
      title: row.title,
      posterUrl: row.poster_url,
      releaseDate: row.release_date,
      voteAverage: row.vote_average,
    }));
  }
}
