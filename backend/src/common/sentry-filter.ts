import { HttpException } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { Event, EventHint } from '@sentry/core';

const EXPECTED_NOT_FOUND_PATHS = [
  /^\/api\/contents\/(?:movie|tv)\/(?:\d+|:tmdbId|\[tmdbId\])\/?$/,
  /^\/api\/contents\/person\/(?:\d+|:personId|\[personId\])(?:\/credits)?\/?$/,
];

function normalizePath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const withoutMethod = value.replace(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i,
    '',
  );

  try {
    return new URL(withoutMethod, 'https://filmott.local').pathname;
  } catch {
    const pathStart = withoutMethod.indexOf('/');
    if (pathStart === -1) {
      return undefined;
    }

    return withoutMethod.slice(pathStart).split(/[?#]/)[0];
  }
}

function getEventPaths(event: Event): string[] {
  return [
    normalizePath(event.request?.url),
    normalizePath(event.transaction),
  ].filter((path): path is string => path !== undefined);
}

function isExpectedNotFoundPath(event: Event): boolean {
  const paths = getEventPaths(event);
  return paths.some((path) =>
    EXPECTED_NOT_FOUND_PATHS.some((pattern) => pattern.test(path)),
  );
}

function getStatusCode(hint: EventHint): number | undefined {
  const originalException = hint.originalException;

  if (originalException instanceof HttpException) {
    return originalException.getStatus();
  }

  if (isAxiosError(originalException)) {
    return originalException.response?.status;
  }

  return undefined;
}

export function filterSentryEvent<T extends Event>(
  event: T,
  hint: EventHint,
): T | null {
  if (getStatusCode(hint) === 404 && isExpectedNotFoundPath(event)) {
    return null;
  }

  return event;
}
