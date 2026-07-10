import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import api from '@/lib/api';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';
import { apiUrl } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';

describe('api integration', () => {
  it('401 응답 후 refresh가 성공하면 원 요청을 재시도해야 한다', async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;

    server.use(
      http.get(apiUrl('/session-probe'), () => {
        protectedCalls += 1;
        if (protectedCalls === 1) {
          return HttpResponse.json({ message: '만료된 세션' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post(apiUrl('/auth/refresh'), () => {
        refreshCalls += 1;
        return HttpResponse.json({ user: { id: 1, nickname: '테스터' } });
      }),
    );

    const response = await api.get('/session-probe');

    expect(response.data).toEqual({ ok: true });
    expect(protectedCalls).toBe(2);
    expect(refreshCalls).toBe(1);
  });

  it('동시 401 응답은 refresh 한 번으로 모두 재시도해야 한다', async () => {
    const protectedCalls = new Map<string, number>();
    let refreshCalls = 0;

    server.use(
      http.get(apiUrl('/session-probe-a'), ({ request }) => {
        const path = new URL(request.url).pathname;
        const calls = (protectedCalls.get(path) ?? 0) + 1;
        protectedCalls.set(path, calls);
        if (calls === 1) {
          return HttpResponse.json({ message: '만료된 세션' }, { status: 401 });
        }
        return HttpResponse.json({ ok: path });
      }),
      http.get(apiUrl('/session-probe-b'), ({ request }) => {
        const path = new URL(request.url).pathname;
        const calls = (protectedCalls.get(path) ?? 0) + 1;
        protectedCalls.set(path, calls);
        if (calls === 1) {
          return HttpResponse.json({ message: '만료된 세션' }, { status: 401 });
        }
        return HttpResponse.json({ ok: path });
      }),
      http.post(apiUrl('/auth/refresh'), async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return HttpResponse.json({ user: { id: 1, nickname: '테스터' } });
      }),
    );

    const [first, second] = await Promise.all([
      api.get('/session-probe-a'),
      api.get('/session-probe-b'),
    ]);

    expect(first.data).toEqual({ ok: '/api/session-probe-a' });
    expect(second.data).toEqual({ ok: '/api/session-probe-b' });
    expect(refreshCalls).toBe(1);
    expect(protectedCalls.get('/api/session-probe-a')).toBe(2);
    expect(protectedCalls.get('/api/session-probe-b')).toBe(2);
  });

  it('refresh 실패 시 인증 필요 이벤트를 발생시켜야 한다', async () => {
    const onAuthRequired = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);

    server.use(
      http.get(apiUrl('/session-expired'), () => {
        return HttpResponse.json({ message: '만료된 세션' }, { status: 401 });
      }),
      http.post(apiUrl('/auth/refresh'), () => {
        return HttpResponse.json(
          { message: '리프레시 토큰 만료' },
          { status: 401 },
        );
      }),
    );

    await expect(api.get('/session-expired')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(onAuthRequired).toHaveBeenCalledTimes(1);

    window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  });
});
