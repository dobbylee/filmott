import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContentMetadataService } from '../recommendation/content-metadata.service';
import type { SimilarContent } from '../recommendation/recommendation.types';

const CHAT_QUERY_STATEMENT_TIMEOUT_MS = 5_000;

@Injectable()
export class EmbeddingService {
  constructor(
    private readonly metadataService: ContentMetadataService,
    private readonly dataSource: DataSource,
  ) {}

  async searchSimilar(
    queryText: string,
    limit: number,
    excludeTmdbIds: number[],
    precomputedEmbedding?: number[],
    signal?: AbortSignal,
  ): Promise<SimilarContent[]> {
    if (!this.metadataService.isEmbeddingAvailable() || signal?.aborted)
      return [];
    const signalArgs: [] | [AbortSignal] = signal ? [signal] : [];

    const embedding =
      precomputedEmbedding ??
      (await this.metadataService.generateEmbedding(queryText, ...signalArgs));
    if (signal?.aborted) return [];
    const embeddingStr = `[${embedding.join(',')}]`;
    const excludeIds = excludeTmdbIds.length > 0 ? excludeTmdbIds : [-1];

    const results = await this.executeSearch(embeddingStr, limit, excludeIds);
    if (signal?.aborted) return [];
    return results;
  }

  private async executeSearch(
    embeddingStr: string,
    limit: number,
    excludeIds: number[],
  ): Promise<SimilarContent[]> {
    const params: (string | number | number[])[] = [
      embeddingStr,
      excludeIds,
      limit,
    ];

    type SimilarContentRow = {
      content_id: number;
      description: string;
      tmdb_id: number;
      content_type: string;
      title: string;
      poster_url: string | null;
      genres: { id: number; name: string }[];
      vote_average: number;
      similarity: number;
      director: string | null;
      origin_country: string | null;
    };
    const query = `SELECT cm.content_id, cm.description,
              c.tmdb_id, c.content_type, c.title, c.poster_url, c.genres, c.vote_average,
              c.director, c.origin_country, c.vote_count,
              1 - (cm.embedding <=> $1::vector) AS similarity,
              (1 - (cm.embedding <=> $1::vector)) * 0.7 + LEAST(LN(GREATEST(c.vote_count, 1) + 1) / 10.0, 0.3) AS weighted_score
       FROM content_metadata cm
       JOIN contents c ON c.id = cm.content_id
       LEFT JOIN rankings r ON r.content_id = c.id AND r.source = 'kobis'
       WHERE c.tmdb_id != ALL($2::int[])
       AND (c.adult IS NOT TRUE)
       AND (c.watch_providers IS NOT NULL OR c.origin_country LIKE '%KR%' OR r.id IS NOT NULL)
       ORDER BY weighted_score DESC
       LIMIT $3`;
    const rows = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('statement_timeout', $1, true)`, [
        `${CHAT_QUERY_STATEMENT_TIMEOUT_MS}ms`,
      ]);
      const result: unknown = await manager.query(query, params);
      return result as SimilarContentRow[];
    });

    return rows.map((row) => ({
      contentId: row.content_id,
      tmdbId: row.tmdb_id,
      contentType: row.content_type,
      title: row.title,
      posterUrl: row.poster_url,
      genres: row.genres || [],
      voteAverage: Number(row.vote_average) || 0,
      description: row.description,
      similarity: Number(row.similarity) || 0,
      director: row.director,
      originCountry: row.origin_country,
      overview: null,
    }));
  }
}
