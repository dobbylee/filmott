const AUTH_RETURN_PATH_KEY = 'filmott_auth_return_path';
const RETURN_PATH_BASE_URL = 'https://filmott.local';

export function validateAuthReturnPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }

  try {
    const url = new URL(value, RETURN_PATH_BASE_URL);
    if (url.origin !== RETURN_PATH_BASE_URL) {
      return '/';
    }
    if (url.pathname.startsWith('//')) {
      return '/';
    }
    if (
      url.pathname === '/auth/callback' ||
      url.pathname.startsWith('/auth/callback/')
    ) {
      return '/';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export function storeCurrentAuthReturnPath(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  try {
    window.sessionStorage.setItem(
      AUTH_RETURN_PATH_KEY,
      validateAuthReturnPath(currentPath),
    );
  } catch {
    // Storage가 차단돼도 OAuth 이동은 계속 진행한다.
  }
}

export function consumeAuthReturnPath(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  try {
    const storedPath = window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
    window.sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
    return validateAuthReturnPath(storedPath);
  } catch {
    return '/';
  }
}
