import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

// api 모듈을 각 테스트에서 새로 불러오기 위해 dynamic import 사용
// 인터셉터 상태(isRefreshing, failedQueue)가 모듈 스코프이므로 격리 필요

describe('api 인스턴스', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('올바른 baseURL을 가져야 한다', async () => {
    const { default: api } = await import('@/lib/api');
    expect(api.defaults.baseURL).toBe('http://localhost:3001/api');
  });

  it('JSON content type을 가져야 한다', async () => {
    const { default: api } = await import('@/lib/api');
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('localStorage에서 Bearer 토큰을 첨부해야 한다', async () => {
    const { default: api } = await import('@/lib/api');
    localStorage.setItem('access_token', 'test-token-123');

    const config = await api.interceptors.request.handlers[0].fulfilled!({
      headers: {},
    } as Parameters<typeof api.interceptors.request.handlers[0]['fulfilled']>[0]);

    expect((config.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token-123',
    );
  });

  it('토큰이 없을 때 첨부하지 않아야 한다', async () => {
    const { default: api } = await import('@/lib/api');
    const config = await api.interceptors.request.handlers[0].fulfilled!({
      headers: {},
    } as Parameters<typeof api.interceptors.request.handlers[0]['fulfilled']>[0]);

    expect((config.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('refreshApi 인스턴스', () => {
  it('올바른 baseURL을 가져야 한다', async () => {
    const { refreshApi } = await import('@/lib/api');
    expect(refreshApi.defaults.baseURL).toBe('http://localhost:3001/api');
  });

  it('인터셉터가 등록되어 있지 않아야 한다', async () => {
    const { refreshApi } = await import('@/lib/api');
    expect(refreshApi.interceptors.request.handlers).toHaveLength(0);
    expect(refreshApi.interceptors.response.handlers).toHaveLength(0);
  });
});

describe('api response 인터셉터 - refresh token', () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchEventSpy.mockRestore();
  });

  const createMockError = (
    status: number,
    url: string,
    retry = false,
  ): AxiosError => ({
    config: {
      url,
      headers: {},
      _retry: retry,
    } as AxiosRequestConfig & { _retry?: boolean } as InternalAxiosRequestConfig,
    response: { status, data: {}, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig },
    isAxiosError: true,
    toJSON: () => ({}),
    name: 'AxiosError',
    message: 'Request failed',
  });

  it('401 응답 시 refreshApi를 통해 토큰 갱신을 시도해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    localStorage.setItem('refresh_token', 'old-refresh-token');

    // refreshApi.post를 mock
    const refreshPostSpy = vi.spyOn(refreshApi, 'post').mockResolvedValueOnce({
      data: {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        user: { id: 1, nickname: 'test', email: 'test@test.com' },
      },
    });

    // api.post가 호출되지 않았는지 확인 (refreshApi만 사용되어야 함)
    const apiPostSpy = vi.spyOn(api, 'post');

    const mockError = createMockError(401, '/some-endpoint');
    const handler = api.interceptors.response.handlers[0];

    try {
      await handler.rejected!(mockError);
    } catch {
      // refresh 후 api(originalRequest)가 호출됨 - mock이 없으면 에러 발생 가능
    }

    expect(refreshPostSpy).toHaveBeenCalledWith('/auth/refresh', { refresh_token: 'old-refresh-token' });
    expect(apiPostSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('access_token')).toBe('new-access-token');
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh-token');

    refreshPostSpy.mockRestore();
    apiPostSpy.mockRestore();
  });

  it('refresh 성공 시 localStorage에 새 토큰을 저장해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    localStorage.setItem('refresh_token', 'old-refresh-token');

    const mockUser = { id: 1, nickname: 'test', email: 'test@test.com' };
    const refreshPostSpy = vi.spyOn(refreshApi, 'post').mockResolvedValueOnce({
      data: {
        access_token: 'refreshed-access-token',
        refresh_token: 'refreshed-refresh-token',
        user: mockUser,
      },
    });

    const mockError = createMockError(401, '/protected-endpoint');
    const handler = api.interceptors.response.handlers[0];

    try {
      await handler.rejected!(mockError);
    } catch {
      // api(originalRequest) 호출 시 실패 가능
    }

    expect(localStorage.getItem('access_token')).toBe('refreshed-access-token');
    expect(localStorage.getItem('refresh_token')).toBe('refreshed-refresh-token');
    expect(localStorage.getItem('user')).toBe(JSON.stringify(mockUser));

    refreshPostSpy.mockRestore();
  });

  it('refresh 실패 시 AUTH_REQUIRED_EVENT를 dispatch해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    localStorage.setItem('access_token', 'old-token');
    localStorage.setItem('refresh_token', 'expired-refresh-token');
    localStorage.setItem('user', '{"id":1}');

    const refreshPostSpy = vi.spyOn(refreshApi, 'post').mockRejectedValueOnce(new Error('Refresh failed'));

    const mockError = createMockError(401, '/protected-endpoint');
    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(mockError)).rejects.toThrow('Refresh failed');

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();

    const authEvent = dispatchEventSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeDefined();

    refreshPostSpy.mockRestore();
  });

  it('refresh_token이 없을 때 AUTH_REQUIRED_EVENT를 dispatch해야 한다', async () => {
    const { default: api } = await import('@/lib/api');

    // refresh_token이 없는 상태
    localStorage.setItem('access_token', 'old-token');

    const mockError = createMockError(401, '/protected-endpoint');
    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(mockError)).rejects.toThrow('No refresh token');

    const authEvent = dispatchEventSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeDefined();
  });

  it('/auth/refresh 요청 자체가 401이면 무한 루프 없이 바로 로그아웃해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    localStorage.setItem('access_token', 'old-token');
    localStorage.setItem('refresh_token', 'bad-refresh-token');

    const refreshPostSpy = vi.spyOn(refreshApi, 'post');

    const mockError = createMockError(401, '/auth/refresh');
    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(mockError)).rejects.toBeDefined();

    // refresh 재시도를 하지 않아야 함 (refreshApi.post가 호출되지 않아야 함)
    expect(refreshPostSpy).not.toHaveBeenCalled();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();

    const authEvent = dispatchEventSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeDefined();

    refreshPostSpy.mockRestore();
  });

  it('이미 재시도한 요청(_retry)은 다시 재시도하지 않아야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    localStorage.setItem('refresh_token', 'some-token');
    const refreshPostSpy = vi.spyOn(refreshApi, 'post');

    const mockError = createMockError(401, '/some-endpoint', true);
    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(mockError)).rejects.toBeDefined();

    // refresh 요청을 시도하지 않아야 함
    expect(refreshPostSpy).not.toHaveBeenCalled();

    refreshPostSpy.mockRestore();
  });

  it('401이 아닌 에러는 그대로 reject해야 한다', async () => {
    const { default: api } = await import('@/lib/api');

    const mockError = createMockError(500, '/some-endpoint');
    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(mockError)).rejects.toBeDefined();

    // AUTH_REQUIRED_EVENT가 dispatch되지 않아야 함
    const authEvent = dispatchEventSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeUndefined();
  });
});
