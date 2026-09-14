import { BadRequestException } from '@nestjs/common';
import type { SimilarContent } from '../recommendation/recommendation.types';
import type { StructuredChatProgress } from './structured-chat-progress';
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

function stableTextPrefix(value: string): string {
  return value
    .trim()
    .replace(/[\uD800-\uDBFF]$/, '')
    .trimEnd();
}

function reasonPrefix(value: string, complete: boolean): string {
  if (complete) return sanitizeRecommendationReason(value);
  // 최종 정규화에서 사라질 수 있는 괄호 suffix를 먼저 노출하지 않는다.
  const opening = value.indexOf('(');
  const stable = opening < 0 ? value : value.slice(0, opening);
  return stableTextPrefix(stable.replace(/\s+/g, ' '));
}

function textField(
  snapshot: Record<string, unknown>,
  key: 'message' | 'followUpQuestion',
  limit: number,
): string {
  if (!hasOwn(snapshot, key)) return '';
  const value = snapshot[key];
  if (typeof value !== 'string' || value.length > limit) invalidResponse();
  return stableTextPrefix(value);
}

export class StructuredChatStreamAccumulator {
  private readonly completedRecommendations: StructuredChatRecommendation[] =
    [];
  private readonly selectedRecommendationKeys: string[] = [];
  private completedRecommendationCount: number | null = null;
  private emittedText = '';

  consume(
    snapshot: unknown,
    candidates: SimilarContent[],
    progress: StructuredChatProgress,
  ): string[] {
    if (!isRecord(snapshot) || !hasOwn(snapshot, 'recommendations')) return [];
    if (!Array.isArray(snapshot.recommendations)) invalidResponse();

    const recommendations = snapshot.recommendations;
    if (recommendations.length > 5) invalidResponse();
    const arrayComplete = progress.isComplete('recommendations');
    if (arrayComplete) {
      if (this.completedRecommendationCount === null) {
        this.completedRecommendationCount = recommendations.length;
      } else if (this.completedRecommendationCount !== recommendations.length) {
        invalidResponse();
      }
    } else if (this.completedRecommendationCount !== null) {
      invalidResponse();
    }
    if (recommendations.length < this.completedRecommendations.length) {
      invalidResponse();
    }
    for (let index = 0; index < this.completedRecommendations.length; index++) {
      if (
        !progress.isComplete('recommendations', index) ||
        JSON.stringify(parseCompletedRecommendation(recommendations[index])) !==
          JSON.stringify(this.completedRecommendations[index])
      ) {
        invalidResponse();
      }
    }

    const sections: string[] = [];
    const usedKeys = new Set<string>();
    for (let index = 0; index < recommendations.length; index++) {
      const value: unknown = recommendations[index];
      if (!isRecord(value)) invalidResponse();
      if (
        !progress.isComplete('recommendations', index, 'tmdbId') ||
        !progress.isComplete('recommendations', index, 'contentType')
      ) {
        return this.appendPrefix(sections.join('\n\n'));
      }
      if (
        typeof value.tmdbId !== 'number' ||
        !Number.isSafeInteger(value.tmdbId) ||
        value.tmdbId <= 0 ||
        (value.contentType !== 'movie' && value.contentType !== 'tv') ||
        Object.keys(value).some(
          (key) => !RECOMMENDATION_KEYS.some((allowed) => allowed === key),
        )
      ) {
        invalidResponse();
      }
      const key = `${value.contentType}:${value.tmdbId}`;
      if (
        usedKeys.has(key) ||
        (this.selectedRecommendationKeys[index] !== undefined &&
          this.selectedRecommendationKeys[index] !== key)
      ) {
        invalidResponse();
      }
      usedKeys.add(key);
      this.selectedRecommendationKeys[index] = key;
      const rawReason = hasOwn(value, 'reason') ? value.reason : '';
      if (typeof rawReason !== 'string' || rawReason.length > 300)
        invalidResponse();
      const candidate = findCandidate(
        {
          tmdbId: value.tmdbId,
          contentType: value.contentType,
          reason: rawReason,
        },
        candidates,
      );
      const reasonComplete = progress.isComplete(
        'recommendations',
        index,
        'reason',
      );
      const reason = reasonPrefix(rawReason, reasonComplete);
      if (reasonComplete && !reason) invalidResponse();
      sections.push(`**${candidate.title}**${reason ? ` - ${reason}` : ''}`);
      if (!progress.isComplete('recommendations', index)) {
        return this.appendPrefix(sections.join('\n\n'));
      }
      if (!reasonComplete) invalidResponse();
      if (index === this.completedRecommendations.length) {
        this.completedRecommendations.push(parseCompletedRecommendation(value));
      }
    }

    if (!arrayComplete) return this.appendPrefix(sections.join('\n\n'));
    if (recommendations.length === 0) {
      const message = textField(snapshot, 'message', 500);
      if (message) sections.push(message);
      if (!progress.isComplete('message')) {
        return this.appendPrefix(sections.join('\n\n'));
      }
    }
    const followUp = textField(snapshot, 'followUpQuestion', 300);
    if (followUp) sections.push(followUp);
    return this.appendPrefix(sections.join('\n\n'));
  }

  private appendPrefix(prefix: string): string[] {
    if (prefix.length > 2000 || !prefix.startsWith(this.emittedText))
      invalidResponse();
    const delta = prefix.slice(this.emittedText.length);
    this.emittedText = prefix;
    return delta ? [delta] : [];
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
