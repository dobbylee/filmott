import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CHAT_MODEL } from '../chat/chat.constants';
import { ContentMetadata } from './entities/content-metadata.entity';
import { Content } from '../contents/content.entity';
import { buildSearchIndexableContentSql } from '../contents/search-indexable-content';

const OPENAI_EMBEDDING_TIMEOUT_MS = 10_000;
const CHAT_QUERY_STATEMENT_TIMEOUT_MS = 5_000;
const RELATED_CONTENT_QUERY_TIMEOUT_MS = 5_000;

export interface SimilarContent {
  contentId: number;
  tmdbId: number;
  contentType: string;
  title: string;
  posterUrl: string | null;
  genres: { id: number; name: string }[];
  voteAverage: number;
  description: string;
  similarity: number;
  director: string | null;
  originCountry: string | null;
  overview: string | null;
}

export interface BatchResult {
  cached: number;
  skipped: number;
  failed: number;
}

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

interface SourceEmbeddingRow {
  content_id: number;
  embedding: string;
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

function parseSourceEmbeddingRow(value: unknown): SourceEmbeddingRow | null {
  if (!Array.isArray(value)) {
    throw new Error('기준 작품 embedding 조회 결과 형식이 올바르지 않습니다.');
  }
  if (value.length === 0) return null;

  const rows = value as unknown[];
  const row = rows[0];
  if (
    !isRecord(row) ||
    typeof row.content_id !== 'number' ||
    !Number.isSafeInteger(row.content_id) ||
    row.content_id <= 0 ||
    typeof row.embedding !== 'string' ||
    row.embedding.length === 0
  ) {
    throw new Error('기준 작품 embedding 조회 결과 형식이 올바르지 않습니다.');
  }

  return { content_id: row.content_id, embedding: row.embedding };
}

function stripControlCharacters(value: string | null | undefined): string {
  if (!value) return '정보 없음';

  const sanitized = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();

  return sanitized || '정보 없음';
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly openai: OpenAI | null;
  private hasMetadataCache: boolean | null = null;

  constructor(
    @InjectRepository(ContentMetadata)
    private readonly metadataRepo: Repository<ContentMetadata>,
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private ensureOpenAI(): OpenAI {
    if (!this.openai) {
      throw new Error('OpenAI API key가 설정되지 않았습니다.');
    }
    return this.openai;
  }

  async hasAnyMetadata(): Promise<boolean> {
    if (this.hasMetadataCache !== null) return this.hasMetadataCache;

    const rows: { exists: boolean }[] = await this.dataSource.query(
      'SELECT EXISTS(SELECT 1 FROM content_metadata LIMIT 1) AS "exists"',
    );
    this.hasMetadataCache = rows[0]?.exists ?? false;
    return this.hasMetadataCache;
  }

  async generateEmbedding(
    text: string,
    signal?: AbortSignal,
  ): Promise<number[]> {
    signal?.throwIfAborted();
    const openai = this.ensureOpenAI();
    const response = await openai.embeddings.create(
      {
        model: 'text-embedding-3-small',
        input: text,
      },
      { timeout: OPENAI_EMBEDDING_TIMEOUT_MS, signal },
    );
    return response.data[0].embedding;
  }

  async generateDescription(
    content: Content,
    signal?: AbortSignal,
  ): Promise<string> {
    signal?.throwIfAborted();
    const openai = this.ensureOpenAI();

    const genreNames = (content.genres || []).map((g) => g.name).join(', ');
    const cast = (content.credits || [])
      .slice(0, 5)
      .map((c) => c.name)
      .join(', ');
    const year = content.releaseDate
      ? new Date(content.releaseDate).getFullYear()
      : '알 수 없음';
    const contentType = content.contentType === 'tv' ? '시리즈' : '영화';

    // OTT 플랫폼 추출
    const ottNames = (content.watchProviders?.flatrate || [])
      .map((p) => p.provider_name)
      .join(', ');

    const prompt = `아래 작품 정보를 바탕으로 분위기, 감성, 테마, 시청 상황을 포함한 한국어 설명을 3~5문장으로 작성하세요.
첫 문장에 연도, 국가, 타입, 플랫폼 정보를 자연스럽게 포함하세요.
제목: ${stripControlCharacters(content.title)}
타입: ${contentType}
장르: ${genreNames || '정보 없음'}
줄거리: ${stripControlCharacters(content.overview)}
감독: ${stripControlCharacters(content.director)}
출연진: ${cast || '정보 없음'}
연도: ${year}
제작 국가: ${stripControlCharacters(content.originCountry)}
OTT 플랫폼: ${ottNames || '정보 없음'}
평점: ${content.voteAverage ?? '정보 없음'}
러닝타임: ${content.runtime ? content.runtime + '분' : '정보 없음'}`;

    const response = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        reasoning_effort: 'low',
        max_completion_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: OPENAI_EMBEDDING_TIMEOUT_MS, signal },
    );

    return response.choices[0]?.message?.content?.trim() || '';
  }

  async cacheContentMetadata(
    contentId: number,
    force = false,
    signal?: AbortSignal,
  ): Promise<ContentMetadata | null> {
    if (signal?.aborted) return null;
    if (!force) {
      const existing = await this.metadataRepo.findOne({
        where: { contentId },
      });
      if (signal?.aborted) return null;
      if (existing) return existing;
    }

    const content = await this.contentRepo.findOne({
      where: { id: contentId },
    });
    if (signal?.aborted) return null;
    if (!content) return null;

    const description = await this.generateDescription(content, signal);
    if (signal?.aborted) return null;
    if (!description) return null;

    const embedding = await this.generateEmbedding(description, signal);
    if (signal?.aborted) return null;
    const embeddingStr = `[${embedding.join(',')}]`;

    // upsert: INSERT ... ON CONFLICT 로 이중 조회 제거
    await this.dataSource.query(
      `INSERT INTO content_metadata (content_id, description, embedding)
       VALUES ($1, $2, $3::vector)
       ON CONFLICT (content_id)
       DO UPDATE SET description = EXCLUDED.description, embedding = EXCLUDED.embedding`,
      [contentId, description, embeddingStr],
    );
    if (signal?.aborted) return null;

    this.hasMetadataCache = true;

    return this.metadataRepo.findOne({
      where: { contentId },
    }) as Promise<ContentMetadata>;
  }

  async searchSimilar(
    queryText: string,
    limit: number,
    excludeTmdbIds: number[],
    precomputedEmbedding?: number[],
    signal?: AbortSignal,
  ): Promise<SimilarContent[]> {
    if (!this.openai || signal?.aborted) return [];
    const signalArgs: [] | [AbortSignal] = signal ? [signal] : [];

    const embedding =
      precomputedEmbedding ??
      (await this.generateEmbedding(queryText, ...signalArgs));
    if (signal?.aborted) return [];
    const embeddingStr = `[${embedding.join(',')}]`;
    const excludeIds = excludeTmdbIds.length > 0 ? excludeTmdbIds : [-1];

    const results = await this.executeSearch(embeddingStr, limit, excludeIds);
    if (signal?.aborted) return [];
    return results;
  }

  async findRelatedContents(
    tmdbId: number,
    contentType: 'movie' | 'tv',
    limit: number,
  ): Promise<RelatedContent[]> {
    const sourceIndexability = buildSearchIndexableContentSql({
      contentAlias: 'source_content',
      minVoteCountPlaceholder: '$3',
      signalSource: { kind: 'exists' },
    });
    const candidateIndexability = buildSearchIndexableContentSql({
      contentAlias: 'c',
      minVoteCountPlaceholder: '$2',
      signalSource: { kind: 'exists' },
    });
    const sourceQuery = `SELECT source_metadata.content_id,
           source_metadata.embedding::text AS embedding
    FROM content_metadata source_metadata
    JOIN contents source_content ON source_content.id = source_metadata.content_id
    WHERE source_content.tmdb_id = $1
      AND source_content.content_type = $2
      AND ${sourceIndexability.predicate}
    LIMIT 1`;
    const candidateQuery = `
    SELECT c.tmdb_id,
           c.content_type,
           c.title,
           c.poster_url,
           TO_CHAR(c.release_date, 'YYYY-MM-DD') AS release_date,
           COALESCE(c.vote_average, 0)::float8 AS vote_average
    FROM content_metadata cm
    JOIN contents c ON c.id = cm.content_id
    WHERE cm.content_id <> $4
      AND ${candidateIndexability.predicate}
    ORDER BY cm.embedding <=> $1::vector
    LIMIT $3`;

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
      const source = parseSourceEmbeddingRow(sourceResult);
      if (!source) return [];

      const result: unknown = await manager.query(candidateQuery, [
        source.embedding,
        candidateIndexability.minVoteCount,
        limit,
        source.content_id,
      ]);
      return parseRelatedContentRows(result);
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

  async batchCacheByContentIds(contentIds: number[]): Promise<BatchResult> {
    const result: BatchResult = { cached: 0, skipped: 0, failed: 0 };
    if (contentIds.length === 0) return result;

    // 이미 캐싱된 content_id 조회
    const existingRows: { content_id: number }[] = await this.dataSource.query(
      `SELECT content_id FROM content_metadata WHERE content_id = ANY($1::int[])`,
      [contentIds],
    );
    const existingIds = new Set(existingRows.map((r) => r.content_id));

    const uncachedIds = contentIds.filter((id) => !existingIds.has(id));
    result.skipped = contentIds.length - uncachedIds.length;

    for (const contentId of uncachedIds) {
      try {
        await this.cacheContentMetadata(contentId, false);
        result.cached++;
        // Rate limit 방어: 100ms 딜레이
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        result.failed++;
        this.logger.warn(
          `배치 캐싱 실패 (contentId: ${contentId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }
}
