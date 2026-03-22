import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ContentMetadata } from './entities/content-metadata.entity';
import { Content } from '../contents/content.entity';

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

export interface SearchFilters {
  ottProviderNames?: string[];
  countries?: string[];
  personNames?: string[];
  dateRange?: { from: string | null; to: string | null };
  contentType?: 'movie' | 'tv';
}

export interface CacheCriteria {
  minVoteCount: number;
  minReleaseDate: Date | null;
  originCountry?: string;
}

export interface BatchResult {
  cached: number;
  skipped: number;
  failed: number;
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
    this.openai = apiKey
      ? new OpenAI({ apiKey })
      : null;
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

  async generateEmbedding(text: string): Promise<number[]> {
    const openai = this.ensureOpenAI();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  async generateDescription(content: Content): Promise<string> {
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
제목: ${content.title}
타입: ${contentType}
장르: ${genreNames}
줄거리: ${content.overview || '정보 없음'}
감독: ${content.director || '정보 없음'}
출연진: ${cast || '정보 없음'}
연도: ${year}
제작 국가: ${content.originCountry || '정보 없음'}
OTT 플랫폼: ${ottNames || '정보 없음'}
평점: ${content.voteAverage ?? '정보 없음'}
러닝타임: ${content.runtime ? content.runtime + '분' : '정보 없음'}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  async cacheContentMetadata(
    contentId: number,
    force = false,
  ): Promise<ContentMetadata | null> {
    if (!force) {
      const existing = await this.metadataRepo.findOne({
        where: { contentId },
      });
      if (existing) return existing;
    }

    const content = await this.contentRepo.findOne({
      where: { id: contentId },
    });
    if (!content) return null;

    const description = await this.generateDescription(content);
    if (!description) return null;

    const embedding = await this.generateEmbedding(description);
    const embeddingStr = `[${embedding.join(',')}]`;

    // upsert: INSERT ... ON CONFLICT 로 이중 조회 제거
    await this.dataSource.query(
      `INSERT INTO content_metadata (content_id, description, embedding)
       VALUES ($1, $2, $3::vector)
       ON CONFLICT (content_id)
       DO UPDATE SET description = EXCLUDED.description, embedding = EXCLUDED.embedding`,
      [contentId, description, embeddingStr],
    );

    this.hasMetadataCache = true;

    return this.metadataRepo.findOne({ where: { contentId } }) as Promise<ContentMetadata>;
  }

  async searchSimilar(
    queryText: string,
    limit: number,
    excludeTmdbIds: number[],
    filters?: SearchFilters,
    precomputedEmbedding?: number[],
  ): Promise<SimilarContent[]> {
    if (!this.openai) return [];

    const embedding = precomputedEmbedding ?? await this.generateEmbedding(queryText);
    const embeddingStr = `[${embedding.join(',')}]`;
    const excludeIds = excludeTmdbIds.length > 0 ? excludeTmdbIds : [-1];

    const hasFilters = filters && (
      (filters.ottProviderNames?.length ?? 0) > 0 ||
      (filters.countries?.length ?? 0) > 0 ||
      (filters.personNames?.length ?? 0) > 0 ||
      (filters.dateRange?.from || filters.dateRange?.to) ||
      filters.contentType !== undefined
    );

    // 1차: 전체 필터 적용
    let results = await this.executeSearch(embeddingStr, limit, excludeIds, filters);

    // 2차: 결과 부족 시 필터 단계적 완화
    if (results.length < 5 && hasFilters) {
      const relaxedFilters: SearchFilters = { ...filters };

      if (results.length < 5 && (relaxedFilters.personNames?.length ?? 0) > 0) {
        delete relaxedFilters.personNames;
        results = await this.executeSearch(embeddingStr, limit, excludeIds, relaxedFilters);
      }

      if (results.length < 5 && (relaxedFilters.countries?.length ?? 0) > 0) {
        delete relaxedFilters.countries;
        results = await this.executeSearch(embeddingStr, limit, excludeIds, relaxedFilters);
      }

      if (results.length < 5 && (relaxedFilters.ottProviderNames?.length ?? 0) > 0) {
        delete relaxedFilters.ottProviderNames;
        results = await this.executeSearch(embeddingStr, limit, excludeIds, relaxedFilters);
      }
    }

    return results;
  }

  private async executeSearch(
    embeddingStr: string,
    limit: number,
    excludeIds: number[],
    filters?: SearchFilters,
  ): Promise<SimilarContent[]> {
    const conditions: string[] = [];
    const params: (string | number | number[] | string[])[] = [embeddingStr, excludeIds];
    let paramIndex = 3;

    // OTT 필터
    if (filters?.ottProviderNames?.length) {
      conditions.push(
        `AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.watch_providers->'flatrate') AS p WHERE p->>'provider_name' = ANY($${paramIndex}::text[]))`,
      );
      params.push(filters.ottProviderNames);
      paramIndex++;
    }

    // 국가 필터 (정확한 boundary 매칭: 쉼표 구분 문자열에서 오탐 방지)
    if (filters?.countries?.length) {
      const countryConditions = filters.countries
        .map(() => {
          const idx = paramIndex;
          paramIndex++;
          return `(c.origin_country = $${idx} OR c.origin_country LIKE $${idx} || ', %' OR c.origin_country LIKE '%, ' || $${idx} OR c.origin_country LIKE '%, ' || $${idx} || ', %')`;
        });
      conditions.push(`AND (${countryConditions.join(' OR ')})`);
      filters.countries.forEach((country) => params.push(country));
    }

    // 인물 필터 (director LIKE + credits jsonb name/character 필드만 검색)
    if (filters?.personNames?.length) {
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
    if (filters?.contentType) {
      conditions.push(`AND c.content_type = $${paramIndex}`);
      params.push(filters.contentType);
      paramIndex++;
    }

    // dateRange 필터
    if (filters?.dateRange) {
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

    params.push(limit);
    const limitParam = `$${paramIndex}`;

    const rows: {
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
    }[] = await this.dataSource.query(
      `SELECT cm.content_id, cm.description,
              c.tmdb_id, c.content_type, c.title, c.poster_url, c.genres, c.vote_average,
              c.director, c.origin_country, c.vote_count,
              1 - (cm.embedding <=> $1::vector) AS similarity,
              (1 - (cm.embedding <=> $1::vector)) * 0.7 + LEAST(LN(GREATEST(c.vote_count, 1) + 1) / 10.0, 0.3) AS weighted_score
       FROM content_metadata cm
       JOIN contents c ON c.id = cm.content_id
       WHERE c.tmdb_id != ALL($2::int[])
       AND (c.adult IS NOT TRUE)
       ${conditions.join('\n       ')}
       ORDER BY weighted_score DESC
       LIMIT ${limitParam}`,
      params,
    );

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

  async batchCacheMetadata(criteria: CacheCriteria): Promise<BatchResult> {
    const result: BatchResult = { cached: 0, skipped: 0, failed: 0 };

    const qb = this.contentRepo
      .createQueryBuilder('c')
      .select(['c.id'])
      .where('c.voteCount >= :minVoteCount', {
        minVoteCount: criteria.minVoteCount,
      });

    if (criteria.minReleaseDate) {
      qb.andWhere('c.releaseDate >= :minReleaseDate', {
        minReleaseDate: criteria.minReleaseDate,
      });
    }

    if (criteria.originCountry) {
      qb.andWhere('c.originCountry LIKE :country', {
        country: `%${criteria.originCountry}%`,
      });
    }

    const contents = await qb.getMany();

    // 이미 캐싱된 content_id 목록 조회
    const existingIds = new Set(
      (
        await this.metadataRepo
          .createQueryBuilder('cm')
          .select('cm.contentId')
          .getMany()
      ).map((m) => m.contentId),
    );

    for (const content of contents) {
      if (existingIds.has(content.id)) {
        result.skipped++;
        continue;
      }

      try {
        await this.cacheContentMetadata(content.id);
        result.cached++;
        // Rate limit 고려: 100ms 딜레이
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        result.failed++;
        this.logger.warn(
          `임베딩 캐싱 실패 (contentId: ${content.id}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }
}
