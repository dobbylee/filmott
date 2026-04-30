import type {
  ChatMessageData,
  ChatRecommendationWithPoster,
  ChatStructuredContent,
} from '@/types/chat';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isChatRecommendationWithPoster(
  value: unknown,
): value is ChatRecommendationWithPoster {
  if (!isRecord(value)) return false;

  const { tmdbId, contentType, title, reason, posterUrl } = value;

  return (
    typeof tmdbId === 'number' &&
    Number.isSafeInteger(tmdbId) &&
    (contentType === 'movie' || contentType === 'tv') &&
    typeof title === 'string' &&
    (reason === undefined || typeof reason === 'string') &&
    (posterUrl === null || typeof posterUrl === 'string')
  );
}

export function isChatRecommendationArray(
  value: unknown,
): value is ChatRecommendationWithPoster[] {
  return Array.isArray(value) && value.every(isChatRecommendationWithPoster);
}

export function isChatStructuredContent(
  value: unknown,
): value is ChatStructuredContent {
  if (!isRecord(value)) return false;

  const { intro, items, outro } = value;

  return (
    typeof intro === 'string' &&
    typeof outro === 'string' &&
    Array.isArray(items) &&
    items.every(
      (item) =>
        isRecord(item) &&
        typeof item.title === 'string' &&
        typeof item.description === 'string',
    )
  );
}

export function isChatMessageData(value: unknown): value is ChatMessageData {
  if (!isRecord(value)) return false;

  const { id, role, content, structuredContent, recommendations, createdAt } =
    value;

  return (
    typeof id === 'number' &&
    Number.isSafeInteger(id) &&
    id > 0 &&
    (role === 'user' || role === 'assistant') &&
    typeof content === 'string' &&
    (structuredContent === undefined ||
      isChatStructuredContent(structuredContent)) &&
    (recommendations === null || isChatRecommendationArray(recommendations)) &&
    typeof createdAt === 'string'
  );
}
