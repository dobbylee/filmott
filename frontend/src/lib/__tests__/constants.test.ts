import { describe, it, expect } from 'vitest';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

describe('상수', () => {
  it('AUTH_REQUIRED_EVENT가 "auth:required"여야 한다', () => {
    expect(AUTH_REQUIRED_EVENT).toBe('auth:required');
  });

  it('AUTH_REQUIRED_EVENT가 비어있지 않은 문자열이어야 한다', () => {
    expect(typeof AUTH_REQUIRED_EVENT).toBe('string');
    expect(AUTH_REQUIRED_EVENT.length).toBeGreaterThan(0);
  });
});
