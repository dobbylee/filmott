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

function isRawRecommendationTrailerJson(text: string): boolean {
  if (!text.startsWith('[') || !text.endsWith(']')) return false;
  if (!text.includes('"tmdbId"') || !text.includes('"contentType"')) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return false;
  }

  return (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(
      (item) =>
        isRecord(item) &&
        parseTmdbId(item.tmdbId) !== undefined &&
        parseContentType(item.contentType) !== undefined,
    )
  );
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

export function stripRecommendationTitleSuffix(title: string): string {
  return title
    .trim()
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/^\*\*\s*/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/\s*\*\*$/, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
}

function stripTrailingRecommendationMeta(reason: string): string {
  let result = reason.trim();

  while (true) {
    const next = result
      .replace(
        /\s*\((?=[^)]*(?:가능|OTT|넷플릭스|Netflix|왓챠|Watcha|웨이브|wavve|티빙|TVING|디즈니|Disney|Apple|Prime|쿠팡|Coupang|WAVVE|톤|장르))[^)]*\)\s*$/i,
        '',
      )
      .trim();

    if (next === result) return result;
    result = next;
  }
}

export function formatRecommendationVisibleLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return '';

  if (isRawRecommendationTrailerJson(trimmed)) {
    return null;
  }

  if (
    /추천(?:해요|합니다|드려요|할게요)$/.test(trimmed) &&
    !/\s[—-]\s/.test(trimmed) &&
    !trimmed.startsWith('**')
  ) {
    return null;
  }

  const recommendationMatch = trimmed.match(
    /^(?:\d+[.)]\s*)?(?:\*\*)?(.+?)(?:\*\*)?\s[—-]\s(.+)$/,
  );
  if (recommendationMatch) {
    const title = stripRecommendationTitleSuffix(recommendationMatch[1]);
    const reason = stripTrailingRecommendationMeta(recommendationMatch[2]);
    return title && reason ? `**${title}** - ${reason}` : trimmed;
  }

  if (
    trimmed.length <= 40 &&
    !/[.!?。！？]$/.test(trimmed) &&
    !/[요다까]$/.test(trimmed)
  ) {
    const title = stripRecommendationTitleSuffix(trimmed);
    return title ? `**${title}**` : trimmed;
  }

  return line;
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

export function extractRecommendationLineTitles(text: string): string[] {
  const rawLines = text.split('\n').map((line) => line.trim());
  const normalizedLines = rawLines
    .map((line) => formatRecommendationVisibleLine(line))
    .filter((line): line is string => line !== null)
    .map((line) => line.trim());

  const lineTitles = normalizedLines
    .map((line) => line.match(/^\*\*(.+?)\*\*\s*[—-]\s+.+$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => stripRecommendationTitleSuffix(match[1]))
    .filter((title) => title.length > 0);

  const standaloneTitles = rawLines
    .filter((line, index, lines) => {
      if (!line) return false;
      if (line.startsWith('#') || line.startsWith('-')) return false;
      if (/^\d+[.)]\s+/.test(line)) return false;
      if (line.includes(RECOMMENDATIONS_TRAILER_OPEN)) return false;
      if (line.includes(RECOMMENDATIONS_TRAILER_CLOSE)) return false;
      if (/[.!?。！？]$/.test(line)) return false;
      if (/[요다까]$/.test(line)) return false;
      if (/추천|원하시는|쪽일까요|끌리세요/.test(line)) return false;

      const prev = lines[index - 1]?.trim() ?? '';
      const next = lines[index + 1]?.trim() ?? '';
      return !prev && !!next && line.length <= 40;
    })
    .map((line) => stripRecommendationTitleSuffix(line))
    .filter((title) => title.length > 0);

  const seen = new Set<string>();
  return [...lineTitles, ...standaloneTitles].filter((title) => {
    const key = normalizeTitle(title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
