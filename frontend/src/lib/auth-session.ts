import axios, { type AxiosRequestConfig } from 'axios';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const AUTH_SESSION_LOCK = 'filmott-auth-session';
const AUTH_SESSION_CHANNEL = 'filmott-auth-session';

type AuthSessionMessage =
  | { type: 'auth-required' }
  | { type: 'session-cleared' };

export const AUTH_SESSION_CLEARED_EVENT = 'auth:session-cleared';

export const sessionApi = axios.create({
  baseURL: apiUrl,
  withCredentials: true,
});

interface RefreshSessionOptions {
  notifyOnFailure?: boolean;
}

let refreshPromise: Promise<void> | null = null;
let shouldNotifyOnRefreshFailure = false;
let fallbackOperationQueue: Promise<void> = Promise.resolve();
let authChannel: BroadcastChannel | null = null;

function dispatchSessionEvent(message: AuthSessionMessage): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      message.type === 'auth-required'
        ? AUTH_REQUIRED_EVENT
        : AUTH_SESSION_CLEARED_EVENT,
    ),
  );
}

function getAuthChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!authChannel) {
    authChannel = new BroadcastChannel(AUTH_SESSION_CHANNEL);
    authChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        typeof message === 'object' &&
        message !== null &&
        ('type' in message) &&
        (message.type === 'auth-required' || message.type === 'session-cleared')
      ) {
        dispatchSessionEvent(message as AuthSessionMessage);
      }
    });
  }

  return authChannel;
}

function publishSessionEvent(message: AuthSessionMessage): void {
  dispatchSessionEvent(message);
  getAuthChannel()?.postMessage(message);
}

function runSessionOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks
      .request<Promise<T>>(AUTH_SESSION_LOCK, operation)
      .then((result) => result);
  }

  const result = fallbackOperationQueue.then(operation, operation);
  fallbackOperationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function notifyAuthRequired(): void {
  publishSessionEvent({ type: 'auth-required' });
}

export function refreshSession(
  options: RefreshSessionOptions = {},
): Promise<void> {
  shouldNotifyOnRefreshFailure =
    shouldNotifyOnRefreshFailure || options.notifyOnFailure === true;

  if (!refreshPromise) {
    refreshPromise = runSessionOperation(async () => {
      await sessionApi.post('/auth/refresh');
    })
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

export function clearServerSession(
  config: AxiosRequestConfig = {},
): Promise<void> {
  return runSessionOperation(async () => {
    await sessionApi.post('/auth/logout', undefined, config);
    publishSessionEvent({ type: 'session-cleared' });
  });
}

export function initializeAuthSessionChannel(): void {
  getAuthChannel();
}

export function resetAuthSessionForTests(): void {
  refreshPromise = null;
  shouldNotifyOnRefreshFailure = false;
  fallbackOperationQueue = Promise.resolve();
  authChannel?.close();
  authChannel = null;
}
