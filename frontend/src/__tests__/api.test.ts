import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

describe('api 인스턴스', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('올바른 baseURL을 가져야 한다', async () => {
    const { default: api } = await import('@/lib/api');
    expect(api.defaults.baseURL).toBe('http://localhost:3001/api');
  });

  it('JSON content type과 withCredentials를 설정해야 한다', async () => {
    const { default: api } = await import('@/lib/api');
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('request interceptor를 사용하지 않아야 한다', async () => {
    const { default: api } = await import('@/lib/api');
    expect(api.interceptors.request.handlers).toHaveLength(0);
  });
});

describe('refreshApi 인스턴스', () => {
  it('올바른 baseURL과 withCredentials를 가져야 한다', async () => {
    const { refreshApi } = await import('@/lib/api');
    expect(refreshApi.defaults.baseURL).toBe('http://localhost:3001/api');
    expect(refreshApi.defaults.withCredentials).toBe(true);
  });

  it('인터셉터가 등록되어 있지 않아야 한다', async () => {
    const { refreshApi } = await import('@/lib/api');
    expect(refreshApi.interceptors.request.handlers).toHaveLength(0);
    expect(refreshApi.interceptors.response.handlers).toHaveLength(0);
  });
});

describe('api response 인터셉터 - cookie session refresh', () => {
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
    response: {
      status,
      data: {},
      statusText: '',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    },
    isAxiosError: true,
    toJSON: () => ({}),
    name: 'AxiosError',
    message: 'Request failed',
  });

  it('401 응답 시 refreshApi를 통해 세션 갱신 후 원 요청을 재시도해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    const refreshPostSpy = vi.spyOn(refreshApi, 'post').mockResolvedValueOnce({
      data: { user: { id: 1, nickname: 'test' } },
    });
    const adapterSpy = vi.fn().mockResolvedValue({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    });
    api.defaults.adapter = adapterSpy;

    const handler = api.interceptors.response.handlers[0];
    const result = await handler.rejected!(createMockError(401, '/protected-endpoint'));

    expect(refreshPostSpy).toHaveBeenCalledWith('/auth/refresh');
    expect(adapterSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);

    refreshPostSpy.mockRestore();
  });

  it('refresh 실패 시 legacy auth storage를 지우고 AUTH_REQUIRED_EVENT를 dispatch해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    localStorage.setItem('access_token', 'old-token');
    localStorage.setItem('refresh_token', 'expired-refresh-token');
    localStorage.setItem('user', '{"id":1}');

    const refreshPostSpy = vi
      .spyOn(refreshApi, 'post')
      .mockRejectedValueOnce(new Error('Refresh failed'));

    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(createMockError(401, '/protected-endpoint'))).rejects.toThrow(
      'Refresh failed',
    );

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();

    const authEvent = dispatchEventSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeDefined();

    refreshPostSpy.mockRestore();
  });

  it('세션 쿠키가 없어 refresh가 401이어도 AUTH_REQUIRED_EVENT를 dispatch해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    const refreshPostSpy = vi.spyOn(refreshApi, 'post').mockRejectedValueOnce(
      createMockError(401, '/auth/refresh'),
    );

    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(createMockError(401, '/protected-endpoint'))).rejects.toBeDefined();

    const authEvent = dispatchEventSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeDefined();

    refreshPostSpy.mockRestore();
  });

  it('/auth/refresh 요청 자체가 401이면 무한 루프 없이 바로 로그아웃해야 한다', async () => {
    const { default: api, refreshApi } = await import('@/lib/api');

    localStorage.setItem('access_token', 'old-token');
    localStorage.setItem('refresh_token', 'bad-refresh-token');

    const refreshPostSpy = vi.spyOn(refreshApi, 'post');
    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(createMockError(401, '/auth/refresh'))).rejects.toBeDefined();

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

    const refreshPostSpy = vi.spyOn(refreshApi, 'post');
    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(createMockError(401, '/some-endpoint', true))).rejects.toBeDefined();

    expect(refreshPostSpy).not.toHaveBeenCalled();

    refreshPostSpy.mockRestore();
  });

  it('401이 아닌 에러는 그대로 reject해야 한다', async () => {
    const { default: api } = await import('@/lib/api');

    const handler = api.interceptors.response.handlers[0];

    await expect(handler.rejected!(createMockError(500, '/some-endpoint'))).rejects.toBeDefined();

    const authEvent = dispatchEventSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeUndefined();
  });
});
