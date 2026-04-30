import type { ChatHistoryMessageDto } from './dto/send-message.dto';
import type { SimilarContent } from './embedding.service';

export const RECOMMENDATIONS_TRAILER_OPEN = '<filmott_recommendations>';
export const RECOMMENDATIONS_TRAILER_CLOSE = '</filmott_recommendations>';

export interface ResolvedChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
}

export interface TrailerRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTmdbId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}

function parseContentType(value: unknown): 'movie' | 'tv' | undefined {
  if (value === 'movie' || value === 'tv') return value;

  return undefined;
}

export function parseRecommendationTrailer(
  text: string,
): TrailerRecommendation[] {
  const openIndex = text.indexOf(RECOMMENDATIONS_TRAILER_OPEN);
  if (openIndex < 0) return [];

  const jsonStart = openIndex + RECOMMENDATIONS_TRAILER_OPEN.length;
  const closeIndex = text.indexOf(RECOMMENDATIONS_TRAILER_CLOSE, jsonStart);
  if (closeIndex < 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, closeIndex).trim()) as unknown;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const recommendations: TrailerRecommendation[] = [];
  const usedKeys = new Set<string>();
  for (const item of parsed) {
    if (!isRecord(item)) return [];

    const tmdbId = parseTmdbId(item.tmdbId);
    const contentType = parseContentType(item.contentType);
    if (!tmdbId || !contentType) return [];

    const key = `${contentType}:${tmdbId}`;
    if (usedKeys.has(key)) continue;

    usedKeys.add(key);
    recommendations.push({ tmdbId, contentType });
  }

  return recommendations.slice(0, 5);
}

export function matchStructuredRecommendationsToCandidates(
  recommendations: TrailerRecommendation[],
  candidates: SimilarContent[],
): ResolvedChatRecommendation[] {
  const matched: ResolvedChatRecommendation[] = [];
  const usedCandidateKeys = new Set<string>();

  for (const recommendation of recommendations) {
    const candidate = findCandidate(recommendation, candidates);
    if (!candidate) continue;

    const contentType = parseContentType(candidate.contentType);
    if (!contentType) continue;

    const key = `${candidate.contentType}:${candidate.tmdbId}`;
    if (usedCandidateKeys.has(key)) continue;

    usedCandidateKeys.add(key);
    matched.push({
      tmdbId: candidate.tmdbId,
      contentType,
      title: candidate.title,
      posterUrl: candidate.posterUrl,
    });
  }

  return matched;
}

function findCandidate(
  recommendation: TrailerRecommendation,
  candidates: SimilarContent[],
): SimilarContent | null {
  return (
    candidates.find(
      (candidate) =>
        candidate.tmdbId === recommendation.tmdbId &&
        candidate.contentType === recommendation.contentType,
    ) ?? null
  );
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function extractPreviouslyRecommendedTitles(
  history: ChatHistoryMessageDto[],
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const message of history) {
    if (message.role !== 'assistant') continue;

    const titles = message.recommendations?.length
      ? message.recommendations.map((recommendation) => recommendation.title)
      : extractRecommendationLineTitles(message.content);

    for (const title of titles) {
      const normalized = normalizeTitle(title);
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      results.push(title);
    }
  }

  return results;
}

function extractRecommendationLineTitles(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.match(/^\*\*(.+?)\*\*\s*[—-]\s+.+$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => {
      const raw = match[1].trim();
      const parenMatch = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      return parenMatch ? parenMatch[1].trim() : raw;
    })
    .filter((title) => title.length > 0);
}
