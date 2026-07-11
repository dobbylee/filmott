import { BadRequestException } from '@nestjs/common';
import type { SimilarContent } from '../embedding/embedding.service';
import type { ChatHistoryMessageDto } from './dto/send-message.dto';

export interface StructuredChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  reason: string;
}

export interface StructuredChatResponse {
  message: string;
  recommendations: StructuredChatRecommendation[];
  followUpQuestion: string;
}

export interface ResolvedChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
}

interface ResolvedRecommendationWithReason {
  card: ResolvedChatRecommendation;
  reason: string;
}

export const CHAT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'filmott_chat_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['message', 'recommendations', 'followUpQuestion'],
      properties: {
        message: { type: 'string', maxLength: 500 },
        recommendations: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['tmdbId', 'contentType', 'reason'],
            properties: {
              tmdbId: { type: 'integer', minimum: 1 },
              contentType: { type: 'string', enum: ['movie', 'tv'] },
              reason: { type: 'string', minLength: 1, maxLength: 300 },
            },
          },
        },
        followUpQuestion: { type: 'string', maxLength: 300 },
      },
    },
  },
} as const;

const INVALID_RESPONSE_MESSAGE =
  'AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.';

function invalidResponse(): never {
  throw new BadRequestException(INVALID_RESPONSE_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key))
  );
}

export function parseStructuredChatResponse(
  text: string,
): StructuredChatResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    invalidResponse();
  }

  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(parsed, ['message', 'recommendations', 'followUpQuestion']) ||
    typeof parsed.message !== 'string' ||
    parsed.message.length > 500 ||
    !Array.isArray(parsed.recommendations) ||
    typeof parsed.followUpQuestion !== 'string' ||
    parsed.followUpQuestion.length > 300 ||
    parsed.recommendations.length > 5
  ) {
    invalidResponse();
  }

  const recommendations: StructuredChatRecommendation[] = [];
  const usedKeys = new Set<string>();
  for (const value of parsed.recommendations) {
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, ['tmdbId', 'contentType', 'reason']) ||
      typeof value.tmdbId !== 'number' ||
      !Number.isSafeInteger(value.tmdbId) ||
      value.tmdbId <= 0 ||
      (value.contentType !== 'movie' && value.contentType !== 'tv') ||
      typeof value.reason !== 'string' ||
      value.reason.trim().length === 0 ||
      value.reason.length > 300
    ) {
      invalidResponse();
    }

    const key = `${value.contentType}:${value.tmdbId}`;
    if (usedKeys.has(key)) invalidResponse();
    usedKeys.add(key);
    recommendations.push({
      tmdbId: value.tmdbId,
      contentType: value.contentType,
      reason: value.reason.trim(),
    });
  }

  const message = parsed.message.trim();
  const followUpQuestion = parsed.followUpQuestion.trim();
  if (
    message.length === 0 &&
    recommendations.length === 0 &&
    followUpQuestion.length === 0
  ) {
    invalidResponse();
  }

  return { message, recommendations, followUpQuestion };
}

export function resolveStructuredChatResponse(
  response: StructuredChatResponse,
  candidates: SimilarContent[],
  options: { requireRecommendations?: boolean } = {},
): { text: string; recommendations: ResolvedChatRecommendation[] } {
  if (
    options.requireRecommendations === true &&
    candidates.length > 0 &&
    response.recommendations.length === 0
  ) {
    invalidResponse();
  }

  const resolved: ResolvedRecommendationWithReason[] =
    response.recommendations.map((recommendation) => {
      const candidate = candidates.find(
        (item) =>
          item.tmdbId === recommendation.tmdbId &&
          item.contentType === recommendation.contentType,
      );
      if (
        !candidate ||
        (candidate.contentType !== 'movie' && candidate.contentType !== 'tv')
      ) {
        invalidResponse();
      }

      const reason = sanitizeRecommendationReason(recommendation.reason);
      if (!reason) invalidResponse();

      return {
        card: {
          tmdbId: candidate.tmdbId,
          contentType: candidate.contentType,
          title: candidate.title,
          posterUrl: candidate.posterUrl,
        },
        reason,
      };
    });

  const recommendationSections = resolved.map(
    ({ card, reason }) => `**${card.title}** - ${reason}`,
  );
  const sections = (
    recommendationSections.length > 0
      ? [...recommendationSections, response.followUpQuestion]
      : [response.message, response.followUpQuestion]
  ).filter((section) => section.length > 0);

  if (sections.length === 0) invalidResponse();
  const text = sections.join('\n\n');
  if (text.length > 2000) invalidResponse();

  return {
    text,
    recommendations: resolved.map(({ card }) => card),
  };
}

export function sanitizeRecommendationReason(reason: string): string {
  let result = reason.replace(/\s+/g, ' ').trim();

  while (true) {
    const next = result
      .replace(
        /\s*\((?:OTT\s*정보\s*없음|(?=[^)]*(?:넷플릭스|Netflix|왓챠|Watcha|웨이브|wavve|티빙|TVING|디즈니|Disney|Apple|Prime|쿠팡|Coupang))[^)]*(?:가능|감상|시청|볼\s*수\s*있)[^)]*|[^)]*(?:장르|톤(?:\/|\s|(?=\))))[^)]*)\)\s*$/i,
        '',
      )
      .trim();
    if (next === result) return result;
    result = next;
  }
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function stripRecommendationTitleSuffix(title: string): string {
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

export function extractPreviouslyRecommendedTitles(
  history: ChatHistoryMessageDto[],
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const message of history) {
    if (message.role !== 'assistant') continue;

    const metadataTitles =
      message.recommendations
        ?.map((recommendation) => recommendation.title.trim())
        .filter((title) => title.length > 0) ?? [];
    const titles =
      metadataTitles.length > 0
        ? metadataTitles
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
  const lines = text.split('\n').map((line) => line.trim());
  const inlineTitles = lines
    .map((line) =>
      line.match(/^(?:\d+[.)]\s*|[-*•]\s+)?\*\*(.+?)\*\*\s*[—-]\s+.+$/),
    )
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => stripRecommendationTitleSuffix(match[1]));
  const standaloneTitles = lines
    .filter((line, index) => {
      if (!line || line.startsWith('#') || line.startsWith('-')) return false;
      if (/^\d+[.)]\s+/.test(line) || /[.!?。！？]$/.test(line)) return false;
      if (
        /[요다까]$/.test(line) ||
        /추천|원하시는|쪽일까요|끌리세요/.test(line)
      ) {
        return false;
      }
      const previous = lines[index - 1] ?? '';
      const next = lines[index + 1] ?? '';
      return !previous && Boolean(next) && line.length <= 40;
    })
    .map(stripRecommendationTitleSuffix);

  const seen = new Set<string>();
  return [...inlineTitles, ...standaloneTitles].filter((title) => {
    if (!title) return false;
    const normalized = normalizeTitle(title);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
