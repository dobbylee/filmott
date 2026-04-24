import type OpenAI from 'openai';
import type { ChatHistoryMessageDto } from './dto/send-message.dto';
import type { SimilarContent } from './embedding.service';

export interface StructuredChatRecommendation {
  tmdbId: number | null;
  contentType: 'movie' | 'tv' | null;
  title: string;
  englishTitle: string | null;
  reason: string;
}

export interface StructuredChatResponse {
  intro: string;
  recommendations: StructuredChatRecommendation[];
  outro: string;
}

export interface ResolvedChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
  reason: string;
}

export const CHAT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'filmott_chat_response',
    description: 'filmott chat answer with structured recommendations',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        intro: {
          type: 'string',
          description: '짧은 도입 문장. Markdown 강조 문법을 사용하지 않는다.',
        },
        recommendations: {
          type: 'array',
          minItems: 0,
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tmdbId: {
                type: ['integer', 'null'],
                description:
                  '추천 후보 목록에서 선택한 작품이면 후보의 ID, 외부 지식 보충이면 null.',
              },
              contentType: {
                type: ['string', 'null'],
                enum: ['movie', 'tv', null],
                description:
                  '추천 후보 목록에서 선택한 작품이면 후보의 타입, 외부 지식 보충이면 null.',
              },
              title: {
                type: 'string',
                description: '한국어 제목 또는 서비스에 표시할 대표 제목.',
              },
              englishTitle: {
                type: ['string', 'null'],
                description: '영어 원제. 모르면 null.',
              },
              reason: {
                type: 'string',
                description: '추천 이유 1~2문장. 제목은 반복하지 않는다.',
              },
            },
            required: [
              'tmdbId',
              'contentType',
              'title',
              'englishTitle',
              'reason',
            ],
          },
        },
        outro: {
          type: 'string',
          description: '추가 요청을 유도하는 짧은 마무리 문장.',
        },
      },
      required: ['intro', 'recommendations', 'outro'],
    },
  },
} satisfies NonNullable<
  OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['response_format']
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRequiredTrimmedString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;

  return trimmed;
}

function toTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length > maxLength) return null;

  return trimmed;
}

function toNullableTrimmedString(
  value: unknown,
  maxLength: number,
): string | null {
  if (value === null) return null;
  return toRequiredTrimmedString(value, maxLength);
}

function parseRecommendation(
  value: unknown,
): StructuredChatRecommendation | null {
  if (!isRecord(value)) return null;

  const title = toRequiredTrimmedString(value.title, 120);
  const reason = toRequiredTrimmedString(value.reason, 500);
  const englishTitle = toNullableTrimmedString(value.englishTitle, 120);
  const tmdbId = parseTmdbId(value.tmdbId);
  const contentType = parseContentType(value.contentType);

  if (!title || !reason || tmdbId === undefined || contentType === undefined) {
    return null;
  }

  return {
    tmdbId,
    contentType,
    title,
    englishTitle,
    reason,
  };
}

function parseTmdbId(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}

function parseContentType(value: unknown): 'movie' | 'tv' | null | undefined {
  if (value === null) return null;
  if (value === 'movie' || value === 'tv') return value;

  return undefined;
}

export function parseStructuredChatResponse(
  value: unknown,
): StructuredChatResponse | null {
  if (!isRecord(value)) return null;

  const intro = toTrimmedString(value.intro, 500);
  const outro = toTrimmedString(value.outro, 500);
  if (
    intro === null ||
    outro === null ||
    !Array.isArray(value.recommendations)
  ) {
    return null;
  }

  const recommendations = value.recommendations
    .map(parseRecommendation)
    .filter((item): item is StructuredChatRecommendation => item !== null)
    .slice(0, 5);

  if (recommendations.length !== value.recommendations.length) {
    return null;
  }

  return {
    intro,
    recommendations,
    outro,
  };
}

export function renderStructuredChatResponse(
  response: StructuredChatResponse,
): string {
  const lines = response.intro ? [response.intro] : [];

  for (const recommendation of response.recommendations) {
    const title = recommendation.englishTitle
      ? `${recommendation.title} (${recommendation.englishTitle})`
      : recommendation.title;
    lines.push(`**${title}** — ${recommendation.reason}`);
  }

  if (response.outro) {
    lines.push(response.outro);
  }

  return lines.join('\n\n');
}

export function matchStructuredRecommendationsToCandidates(
  recommendations: StructuredChatRecommendation[],
  candidates: SimilarContent[],
): {
  matched: ResolvedChatRecommendation[];
  unmatched: { korean: string; english: string | null }[];
} {
  const matched: ResolvedChatRecommendation[] = [];
  const unmatched: { korean: string; english: string | null }[] = [];
  const usedCandidateKeys = new Set<string>();

  for (const recommendation of recommendations) {
    const candidate = findCandidate(recommendation, candidates);

    if (candidate) {
      const contentType = parseContentType(candidate.contentType);
      if (!contentType) {
        unmatched.push({
          korean: recommendation.title,
          english: recommendation.englishTitle,
        });
        continue;
      }

      const key = `${candidate.contentType}:${candidate.tmdbId}`;
      if (usedCandidateKeys.has(key)) continue;

      usedCandidateKeys.add(key);
      matched.push({
        tmdbId: candidate.tmdbId,
        contentType,
        title: candidate.title,
        posterUrl: candidate.posterUrl,
        reason: recommendation.reason,
      });
    } else {
      unmatched.push({
        korean: recommendation.title,
        english: recommendation.englishTitle,
      });
    }
  }

  return { matched, unmatched };
}

function findCandidate(
  recommendation: StructuredChatRecommendation,
  candidates: SimilarContent[],
): SimilarContent | null {
  if (!recommendation.tmdbId || !recommendation.contentType) {
    return null;
  }

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
