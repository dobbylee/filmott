import axios, { type AxiosRequestConfig } from 'axios';
import { clearLegacyAuthStorage } from '@/lib/auth-storage';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const sessionApi = axios.create({
  baseURL: apiUrl,
  withCredentials: true,
});

interface RefreshSessionOptions {
  notifyOnFailure?: boolean;
}

let refreshPromise: Promise<void> | null = null;
let shouldNotifyOnRefreshFailure = false;

export function notifyAuthRequired(): void {
  clearLegacyAuthStorage();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }
}

export function refreshSession(
  options: RefreshSessionOptions = {},
): Promise<void> {
  shouldNotifyOnRefreshFailure =
    shouldNotifyOnRefreshFailure || options.notifyOnFailure === true;

  if (!refreshPromise) {
    refreshPromise = sessionApi
      .post('/auth/refresh')
      .then(() => undefined)
      .catch((error: unknown) => {
        if (shouldNotifyOnRefreshFailure) {
          notifyAuthRequired();
        }
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
        shouldNotifyOnRefreshFailure = false;
      });
  }

  return refreshPromise;
}

export async function clearServerSession(
  config: AxiosRequestConfig = {},
): Promise<void> {
  await sessionApi.post('/auth/logout', undefined, config);
}

export function resetAuthSessionForTests(): void {
  refreshPromise = null;
  shouldNotifyOnRefreshFailure = false;
}
