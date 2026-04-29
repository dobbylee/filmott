import { isAxiosError } from 'axios';

export interface ExternalApiErrorSummary {
  service: string;
  endpointPath?: string;
  status?: number;
  statusText?: string;
  code?: string;
  message: string;
}

const SENSITIVE_QUERY_KEYS = new Set([
  'api_key',
  'apikey',
  'key',
  'token',
  'access_token',
  'auth',
  'authorization',
]);

function extractPath(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url, 'https://external-api.local').pathname;
  } catch {
    return url.split('?')[0] || undefined;
  }
}

function redactSensitiveText(value: string): string {
  let redacted = value.replace(
    /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    'Bearer [REDACTED]',
  );

  redacted = redacted.replace(
    /([?&])([^=&#\s]+)=([^&#\s]+)/g,
    (match: string, prefix: string, key: string) => {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        return `${prefix}${key}=[REDACTED]`;
      }
      return match;
    },
  );

  return redacted.replace(/https?:\/\/[^\s]+/g, (match) => {
    try {
      const parsed = new URL(match);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return match.split('?')[0];
    }
  });
}

export function summarizeExternalApiError(
  service: string,
  error: unknown,
  fallbackEndpointPath?: string,
): ExternalApiErrorSummary {
  if (isAxiosError(error)) {
    const endpointPath =
      extractPath(error.config?.url) ??
      extractPath(error.response?.config?.url) ??
      fallbackEndpointPath;

    return {
      service,
      endpointPath,
      status: error.response?.status,
      statusText: error.response?.statusText,
      code: error.code,
      message: redactSensitiveText(error.message),
    };
  }

  return {
    service,
    endpointPath: fallbackEndpointPath,
    message:
      error instanceof Error
        ? redactSensitiveText(error.message)
        : 'Unknown external API error',
  };
}
