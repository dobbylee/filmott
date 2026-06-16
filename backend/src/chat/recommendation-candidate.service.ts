import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContentsService } from '../contents/contents.service';
import { ContentSearchFilters } from './content-search.service';
import { EmbeddingService, SimilarContent } from './embedding.service';
import { ParsedIntent } from './intent-analyzer';
import { ResolvedChatRecommendation } from './structured-chat-response';

const CHAT_RECOMMENDATION_LIMIT = 5;

export interface RecommendationRerankContext {
  contentType?: 'movie' | 'tv' | null;
  genres?: string[];
  countries?: string[];
  personNames?: string[];
}

const RERANK_WEIGHTS = {
  GENRE_MATCH: 0.25,
  COUNTRY_MATCH: 0.15,
  PERSON_MATCH: 0.15,
  CONTENT_TYPE_MATCH: 0.1,
  VOTE_AVERAGE: 0.1,
} as const;

interface ReferenceRow {
  content_id: number;
  tmdb_id: number;
  embedding: string;
}

@Injectable()
export class RecommendationCandidateService {
  private readonly logger = new Logger(RecommendationCandidateService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly contentsService: ContentsService,
    private readonly dataSource: DataSource,
  ) {}

  selectConfirmedRecommendationCandidates(
    candidates: SimilarContent[],
    preferredContentType: 'movie' | 'tv' | null,
    previouslyRecommended: string[],
    rerankContext: RecommendationRerankContext = {},
  ): SimilarContent[] {
    const selected: SimilarContent[] = [];
    const usedKeys = new Set<string>();
    const previousTitleKeys = new Set(
      previouslyRecommended.map((title) => this.normalizeTitleForMatch(title)),
    );
    const rankedCandidates = this.rerankCandidates(candidates, rerankContext);

    for (const candidate of rankedCandidates) {
      if (selected.length >= CHAT_RECOMMENDATION_LIMIT) break;

      const contentType = this.parseContentType(candidate.contentType);
      if (!contentType) continue;
      if (preferredContentType && contentType !== preferredContentType) {
        continue;
      }
      if (!candidate.posterUrl) continue;

      const normalizedTitle = this.normalizeTitleForMatch(candidate.title);
      if (previousTitleKeys.has(normalizedTitle)) continue;

      const key = `${contentType}:${candidate.tmdbId}`;
      if (usedKeys.has(key)) continue;

      usedKeys.add(key);
      selected.push(candidate);
    }

    return selected;
  }

  toResolvedRecommendations(
    candidates: SimilarContent[],
  ): ResolvedChatRecommendation[] {
    const recommendations: ResolvedChatRecommendation[] = [];

    for (const candidate of candidates) {
      const contentType = this.parseContentType(candidate.contentType);
      if (!contentType || !candidate.posterUrl) continue;

      recommendations.push({
        tmdbId: candidate.tmdbId,
        contentType,
        title: candidate.title,
        posterUrl: candidate.posterUrl,
      });
    }

    return recommendations;
  }

  cacheRecommendationMetadataInBackground(candidates: SimilarContent[]): void {
    const contentIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.contentId)
          .filter((contentId) => Number.isInteger(contentId)),
      ),
    ];

    if (contentIds.length === 0) return;

    this.embeddingService.batchCacheByContentIds(contentIds).catch((error) => {
      this.logger.warn(
        `추천 후보 metadata 캐싱 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async resolveReferenceEmbedding(
    referenceTitles: string[],
  ): Promise<{ embedding: number[]; tmdbId: number } | null> {
    if (referenceTitles.length === 0) return null;

    for (const title of referenceTitles) {
      try {
        const dbResult = await this.resolveReferenceEmbeddingFromDb(title);
        if (dbResult) return dbResult;

        const tmdbResult = await this.resolveReferenceEmbeddingFromTmdb(title);
        if (tmdbResult) return tmdbResult;
      } catch (error) {
        this.logger.warn(
          `참조 작품 임베딩 해결 실패 ("${title}"): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return null;
  }

  buildFiltersFromIntent(intent: ParsedIntent): ContentSearchFilters {
    const filters: ContentSearchFilters = {};
    if (intent.ottProviderNames.length > 0)
      filters.ottProviderNames = intent.ottProviderNames;
    if (intent.countries.length > 0) filters.countries = intent.countries;
    if (intent.excludeCountries.length > 0)
      filters.excludeCountries = intent.excludeCountries;
    if (intent.personNames.length > 0) filters.personNames = intent.personNames;
    if (intent.dateRange && (intent.dateRange.from || intent.dateRange.to)) {
      filters.dateRange = intent.dateRange;
    }
    if (intent.contentType) filters.contentType = intent.contentType;
    if (intent.genres.length > 0) filters.genres = intent.genres;
    return filters;
  }

  private rerankCandidates(
    candidates: SimilarContent[],
    context: RecommendationRerankContext,
  ): SimilarContent[] {
    if (!this.hasRerankContext(context)) {
      return candidates;
    }

    return candidates
      .map((candidate, index) => ({
        candidate,
        index,
        score: this.calculateRerankScore(candidate, context),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ candidate }) => candidate);
  }

  private hasRerankContext(context: RecommendationRerankContext): boolean {
    return (
      context.contentType !== undefined ||
      (context.genres?.length ?? 0) > 0 ||
      (context.countries?.length ?? 0) > 0 ||
      (context.personNames?.length ?? 0) > 0
    );
  }

  private calculateRerankScore(
    candidate: SimilarContent,
    context: RecommendationRerankContext,
  ): number {
    let score = candidate.similarity;
    score +=
      (Math.max(candidate.voteAverage, 0) / 10) * RERANK_WEIGHTS.VOTE_AVERAGE;

    if (
      context.contentType &&
      this.parseContentType(candidate.contentType) === context.contentType
    ) {
      score += RERANK_WEIGHTS.CONTENT_TYPE_MATCH;
    }

    const genreMatchRatio = this.calculateGenreMatchRatio(
      candidate.genres.map((genre) => genre.name),
      context.genres ?? [],
    );
    score += genreMatchRatio * RERANK_WEIGHTS.GENRE_MATCH;

    if (this.matchesCountry(candidate.originCountry, context.countries ?? [])) {
      score += RERANK_WEIGHTS.COUNTRY_MATCH;
    }

    if (this.matchesPerson(candidate.director, context.personNames ?? [])) {
      score += RERANK_WEIGHTS.PERSON_MATCH;
    }

    return score;
  }

  private calculateGenreMatchRatio(
    candidateGenres: string[],
    requestedGenres: string[],
  ): number {
    if (candidateGenres.length === 0 || requestedGenres.length === 0) return 0;

    const normalizedCandidateGenres = new Set(
      candidateGenres.map((genre) => this.normalizeTitleForMatch(genre)),
    );
    const matchedCount = requestedGenres.filter((genre) =>
      normalizedCandidateGenres.has(this.normalizeTitleForMatch(genre)),
    ).length;

    return matchedCount / requestedGenres.length;
  }

  private matchesCountry(
    originCountry: string | null,
    requestedCountries: string[],
  ): boolean {
    if (!originCountry || requestedCountries.length === 0) return false;

    const candidateCountries = originCountry
      .split(',')
      .map((country) => country.trim());

    return requestedCountries.some((country) =>
      candidateCountries.includes(country),
    );
  }

  private matchesPerson(
    director: string | null,
    requestedPersonNames: string[],
  ): boolean {
    if (!director || requestedPersonNames.length === 0) return false;

    return requestedPersonNames.some((personName) =>
      director.includes(personName),
    );
  }

  private async resolveReferenceEmbeddingFromDb(
    title: string,
  ): Promise<{ embedding: number[]; tmdbId: number } | null> {
    const rows: ReferenceRow[] = await this.dataSource.query(
      `SELECT c.id AS content_id, c.tmdb_id, cm.embedding::text
       FROM contents c
       JOIN content_metadata cm ON cm.content_id = c.id
       WHERE c.title ILIKE $1
       LIMIT 1`,
      [title],
    );

    if (rows.length === 0 || !rows[0].embedding) return null;

    const embedding = this.parseEmbedding(rows[0].embedding);
    if (!embedding) {
      this.logger.warn(
        `참조 작품 임베딩 파싱 실패: "${title}" (tmdbId: ${rows[0].tmdb_id})`,
      );
      return null;
    }

    this.logger.log(
      `참조 작품 임베딩 사용: "${title}" (tmdbId: ${rows[0].tmdb_id})`,
    );
    return { embedding, tmdbId: rows[0].tmdb_id };
  }

  private async resolveReferenceEmbeddingFromTmdb(
    title: string,
  ): Promise<{ embedding: number[]; tmdbId: number } | null> {
    const [movieResult, tvResult] = await Promise.all([
      this.contentsService.searchContents(title, 'movie', 1).catch(() => null),
      this.contentsService.searchContents(title, 'tv', 1).catch(() => null),
    ]);

    const firstMatch =
      (movieResult?.results?.[0]
        ? { id: movieResult.results[0].id, type: 'movie' as const }
        : null) ??
      (tvResult?.results?.[0]
        ? { id: tvResult.results[0].id, type: 'tv' as const }
        : null);

    if (!firstMatch) return null;

    const content = await this.contentsService.findOrFetchByTmdbId(
      firstMatch.id,
      firstMatch.type,
    );
    const metadata = await this.embeddingService.cacheContentMetadata(
      content.id,
    );
    if (!metadata?.embedding) return null;

    const embedding = this.parseEmbedding(metadata.embedding);
    if (!embedding) {
      this.logger.warn(
        `참조 작품 TMDB 임베딩 파싱 실패: "${title}" (tmdbId: ${content.tmdbId})`,
      );
      return null;
    }

    this.logger.log(
      `참조 작품 TMDB 검색 후 임베딩 생성: "${title}" (tmdbId: ${content.tmdbId})`,
    );
    return { embedding, tmdbId: content.tmdbId };
  }

  private parseEmbedding(value: string): number[] | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }

    if (
      Array.isArray(parsed) &&
      parsed.every((item): item is number => typeof item === 'number')
    ) {
      return parsed;
    }

    return null;
  }

  private normalizeTitleForMatch(title: string): string {
    return title
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .replace(/\s*시즌(?:\s*\d+)?\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private parseContentType(value: string | undefined): 'movie' | 'tv' | null {
    if (value === 'movie' || value === 'tv') return value;
    return null;
  }
}
