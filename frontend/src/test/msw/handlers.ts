import type { HttpHandler } from 'msw';

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export const handlers: HttpHandler[] = [];
