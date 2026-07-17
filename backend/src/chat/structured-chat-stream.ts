import { BadRequestException } from '@nestjs/common';
import type { SimilarContent } from '../embedding/embedding.service';
import {
  resolveStructuredChatResponse,
  sanitizeRecommendationReason,
  type ResolvedChatRecommendation,
  type StructuredChatRecommendation,
  type StructuredChatResponse,
} from './structured-chat-response';

const INVALID_RESPONSE_MESSAGE =
  'AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.';
const RECOMMENDATION_KEYS = ['tmdbId', 'contentType', 'reason'] as const;

interface FinalizedStructuredChatStream {
  remainingText: string;
  text: string;
  recommendations: ResolvedChatRecommendation[];
}

function invalidResponse(): never {
  throw new BadRequestException(INVALID_RESPONSE_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyRecommendationKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === RECOMMENDATION_KEYS.length &&
    keys.every((key) =>
      RECOMMENDATION_KEYS.includes(key as (typeof RECOMMENDATION_KEYS)[number]),
    )
  );
}

function parseCompletedRecommendation(
  value: unknown,
): StructuredChatRecommendation {
  if (
    !isRecord(value) ||
    !hasOnlyRecommendationKeys(value) ||
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

  return {
    tmdbId: value.tmdbId,
    contentType: value.contentType,
    reason: value.reason.trim(),
  };
}

function findCandidate(
  recommendation: StructuredChatRecommendation,
  candidates: SimilarContent[],
): SimilarContent {
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
  return candidate;
}

export class StructuredChatStreamAccumulator {
  private readonly emittedRecommendations: StructuredChatRecommendation[] = [];
  private readonly usedRecommendationKeys = new Set<string>();
  private completedRecommendationCount: number | null = null;
  private emittedText = '';

  consume(snapshot: unknown, candidates: SimilarContent[]): string[] {
    if (!isRecord(snapshot) || !hasOwn(snapshot, 'recommendations')) return [];
    if (!Array.isArray(snapshot.recommendations)) invalidResponse();

    const recommendations = snapshot.recommendations;
    if (recommendations.length > 5) invalidResponse();
    const isRecommendationArrayComplete = hasOwn(snapshot, 'message');
    if (isRecommendationArrayComplete) {
      if (this.completedRecommendationCount === null) {
        this.completedRecommendationCount = recommendations.length;
      } else if (this.completedRecommendationCount !== recommendations.length) {
        invalidResponse();
      }
    } else if (this.completedRecommendationCount !== null) {
      invalidResponse();
    }
    const completedCount = isRecommendationArrayComplete
      ? recommendations.length
      : Math.max(0, recommendations.length - 1);

    if (completedCount < this.emittedRecommendations.length) invalidResponse();

    for (
      let index = 0;
      index < this.emittedRecommendations.length;
      index += 1
    ) {
      const current = parseCompletedRecommendation(recommendations[index]);
      if (
        JSON.stringify(current) !==
        JSON.stringify(this.emittedRecommendations[index])
      ) {
        invalidResponse();
      }
    }

    const deltas: string[] = [];
    for (
      let index = this.emittedRecommendations.length;
      index < completedCount;
      index += 1
    ) {
      const recommendation = parseCompletedRecommendation(
        recommendations[index],
      );
      const key = `${recommendation.contentType}:${recommendation.tmdbId}`;
      if (this.usedRecommendationKeys.has(key)) invalidResponse();

      const candidate = findCandidate(recommendation, candidates);
      const reason = sanitizeRecommendationReason(recommendation.reason);
      if (!reason) invalidResponse();

      const section = `**${candidate.title}** - ${reason}`;
      const delta = `${this.emittedText.length > 0 ? '\n\n' : ''}${section}`;
      this.emittedText += delta;
      this.emittedRecommendations.push(recommendation);
      this.usedRecommendationKeys.add(key);
      deltas.push(delta);
    }

    return deltas;
  }

  finalize(
    response: StructuredChatResponse,
    candidates: SimilarContent[],
    options: { requireRecommendations?: boolean } = {},
  ): FinalizedStructuredChatStream {
    const resolved = resolveStructuredChatResponse(
      response,
      candidates,
      options,
    );
    if (!resolved.text.startsWith(this.emittedText)) invalidResponse();

    return {
      remainingText: resolved.text.slice(this.emittedText.length),
      text: resolved.text,
      recommendations: resolved.recommendations,
    };
  }

  getEmittedText(): string {
    return this.emittedText;
  }
}
