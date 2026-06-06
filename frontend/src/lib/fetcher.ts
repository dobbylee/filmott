const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function hasMessage(value: unknown): value is { message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/**
 * 서버 컴포넌트에서 백엔드 API를 호출하기 위한 fetch 래퍼
 */
export async function fetchApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let message = `API error: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (hasMessage(body)) message = body.message;
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }
    throw new ApiError(message, res.status, res.statusText);
  }

  return res.json();
}
