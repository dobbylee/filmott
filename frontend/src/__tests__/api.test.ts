import { describe, it, expect, beforeEach, vi } from 'vitest';
import api from '@/lib/api';

describe('api 인스턴스', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('올바른 baseURL을 가져야 한다', () => {
    expect(api.defaults.baseURL).toBe('http://localhost:3001/api');
  });

  it('JSON content type을 가져야 한다', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('localStorage에서 Bearer 토큰을 첨부해야 한다', async () => {
    localStorage.setItem('access_token', 'test-token-123');

    // Trigger request interceptor by creating a mock adapter
    const config = await api.interceptors.request.handlers[0].fulfilled!({
      headers: {},
    } as Parameters<typeof api.interceptors.request.handlers[0]['fulfilled']>[0]);

    expect((config.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token-123',
    );
  });

  it('토큰이 없을 때 첨부하지 않아야 한다', async () => {
    const config = await api.interceptors.request.handlers[0].fulfilled!({
      headers: {},
    } as Parameters<typeof api.interceptors.request.handlers[0]['fulfilled']>[0]);

    expect((config.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
