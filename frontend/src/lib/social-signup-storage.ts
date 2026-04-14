const SOCIAL_SIGNUP_TOKEN_KEY = 'filmott_social_signup_token';

export function extractSocialSignupTokenFromHash(
  hash: string,
): string | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!normalizedHash) return null;

  const token = new URLSearchParams(normalizedHash).get('signup');
  return token && token.length > 0 ? token : null;
}

export function persistSocialSignupTokenFromHash(hash: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = extractSocialSignupTokenFromHash(hash);
  if (!token) {
    return null;
  }

  window.sessionStorage.setItem(SOCIAL_SIGNUP_TOKEN_KEY, token);
  return token;
}

export function getStoredSocialSignupToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = window.sessionStorage.getItem(SOCIAL_SIGNUP_TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

export function clearStoredSocialSignupToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(SOCIAL_SIGNUP_TOKEN_KEY);
}
