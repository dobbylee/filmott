import { describe, it, expect, beforeEach, vi } from 'vitest';
import api from '@/lib/api';

describe('api instance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should have correct baseURL', () => {
    expect(api.defaults.baseURL).toBe('http://localhost:3001/api');
  });

  it('should have JSON content type', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('should attach Bearer token from localStorage', async () => {
    localStorage.setItem('access_token', 'test-token-123');

    // Trigger request interceptor by creating a mock adapter
    const config = await api.interceptors.request.handlers[0].fulfilled!({
      headers: {},
    } as Parameters<typeof api.interceptors.request.handlers[0]['fulfilled']>[0]);

    expect((config.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token-123',
    );
  });

  it('should not attach token when not present', async () => {
    const config = await api.interceptors.request.handlers[0].fulfilled!({
      headers: {},
    } as Parameters<typeof api.interceptors.request.handlers[0]['fulfilled']>[0]);

    expect((config.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
