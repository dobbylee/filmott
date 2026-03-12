import { describe, it, expect } from 'vitest';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

describe('constants', () => {
  it('AUTH_REQUIRED_EVENT should be "auth:required"', () => {
    expect(AUTH_REQUIRED_EVENT).toBe('auth:required');
  });

  it('AUTH_REQUIRED_EVENT should be a non-empty string', () => {
    expect(typeof AUTH_REQUIRED_EVENT).toBe('string');
    expect(AUTH_REQUIRED_EVENT.length).toBeGreaterThan(0);
  });
});
