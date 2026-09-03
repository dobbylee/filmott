import { HttpException } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type {
  Breadcrumb,
  Event,
  EventHint,
  SpanJSON,
  TransactionEvent,
} from '@sentry/core';

const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_QUERY_PARAMETER =
  /\b(api_key|apikey|key|token|access_token|auth|authorization)=([^&#\s]+)/gi;
const BEARER_TOKEN = /\b(Bearer)\s+[^,;\s]+/gi;
const SENSITIVE_FIELD_NAMES = new Set([
  'authorization',
  'cookie',
  'password',
  'proxyauthorization',
  'secret',
  'setcookie',
]);
const SENSITIVE_PARAMETER_NAMES = new Set([
  'accesstoken',
  'apikey',
  'auth',
  'authorization',
  'key',
  'token',
]);
const PARAMETER_CONTAINER_NAMES = new Set([
  'httpquery',
  'params',
  'query',
  'querystring',
  'searchparams',
]);

const EXPECTED_NOT_FOUND_PATHS = [
  /^\/api\/contents\/(?:movie|tv)\/(?:\d+|:tmdbId|\[tmdbId\])\/?$/,
  /^\/api\/contents\/person\/(?:\d+|:personId|\[personId\])(?:\/credits)?\/?$/,
];

function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveFieldName(value: string): boolean {
  const normalized = normalizeFieldName(value);
  if (SENSITIVE_FIELD_NAMES.has(normalized)) {
    return true;
  }

  const segments = value.toLowerCase().split(/[._-]/);
  const lastSegment = segments.at(-1);
  return lastSegment ? SENSITIVE_FIELD_NAMES.has(lastSegment) : false;
}

function isParameterContainer(value: string): boolean {
  return PARAMETER_CONTAINER_NAMES.has(normalizeFieldName(value));
}

function isSensitiveValueContainer(value: string): boolean {
  return normalizeFieldName(value) === 'cookies';
}

function redactSensitiveString(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PARAMETER, '$1=[REDACTED]')
    .replace(BEARER_TOKEN, '$1 [REDACTED]');
}

function isPlainObject(value: object): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function sanitizeSentryValue(
  value: unknown,
  fieldName?: string,
  inParameterContainer = false,
  redactValue = false,
): unknown {
  if (redactValue) {
    return REDACTED_VALUE;
  }

  if (
    fieldName &&
    (isSensitiveFieldName(fieldName) ||
      (inParameterContainer &&
        SENSITIVE_PARAMETER_NAMES.has(normalizeFieldName(fieldName))))
  ) {
    return REDACTED_VALUE;
  }

  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (Array.isArray(value)) {
    const parameterContainer =
      inParameterContainer || isParameterContainer(fieldName ?? '');
    return (value as unknown[]).map((item) => {
      if (
        parameterContainer &&
        Array.isArray(item) &&
        typeof item[0] === 'string' &&
        SENSITIVE_PARAMETER_NAMES.has(normalizeFieldName(item[0]))
      ) {
        return item.map((tupleValue, index) =>
          index === 1 ? REDACTED_VALUE : sanitizeSentryValue(tupleValue),
        );
      }

      return sanitizeSentryValue(
        item,
        undefined,
        parameterContainer,
        isSensitiveValueContainer(fieldName ?? ''),
      );
    });
  }

  if (typeof value !== 'object' || value === null || !isPlainObject(value)) {
    return value;
  }

  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => [
    key,
    sanitizeSentryValue(
      entryValue,
      key,
      inParameterContainer || isParameterContainer(fieldName ?? ''),
      isSensitiveValueContainer(fieldName ?? ''),
    ),
  ]);

  return Object.fromEntries(sanitizedEntries);
}

export function sanitizeSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return sanitizeSentryValue(breadcrumb) as Breadcrumb;
}

export function sanitizeSentryTransaction(
  event: TransactionEvent,
): TransactionEvent {
  return sanitizeSentryValue(event) as TransactionEvent;
}

export function sanitizeSentrySpan(span: SpanJSON): SpanJSON {
  return sanitizeSentryValue(span) as SpanJSON;
}

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

  return sanitizeSentryValue(event) as T;
}
