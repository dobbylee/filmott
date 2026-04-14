import {
  clearStoredSocialSignupToken,
  extractSocialSignupTokenFromHash,
  getStoredSocialSignupToken,
  persistSocialSignupTokenFromHash,
} from '@/lib/social-signup-storage';

describe('social-signup-storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('hash에서 signup 토큰을 추출해야 한다', () => {
    expect(extractSocialSignupTokenFromHash('#signup=test-token')).toBe(
      'test-token',
    );
  });

  it('signup 파라미터가 없으면 null을 반환해야 한다', () => {
    expect(extractSocialSignupTokenFromHash('#foo=bar')).toBeNull();
  });

  it('hash의 signup 토큰을 sessionStorage에 저장해야 한다', () => {
    persistSocialSignupTokenFromHash('#signup=test-token');

    expect(getStoredSocialSignupToken()).toBe('test-token');
  });

  it('저장된 signup 토큰을 삭제해야 한다', () => {
    persistSocialSignupTokenFromHash('#signup=test-token');

    clearStoredSocialSignupToken();

    expect(getStoredSocialSignupToken()).toBeNull();
  });
});
