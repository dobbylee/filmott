const LEGACY_AUTH_STORAGE_KEYS = ['access_token', 'refresh_token', 'user'] as const;

export function clearLegacyAuthStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  LEGACY_AUTH_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}
