import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearServerSession,
  refreshSession,
  resetAuthSessionForTests,
  sessionApi,
} from '@/lib/auth-session';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

describe('auth session coordinator', () => {
  beforeEach(() => {
    resetAuthSessionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuthSessionForTests();
  });

  it('동시 세션 갱신은 하나의 요청을 공유해야 한다', async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshRequest = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const postSpy = vi
      .spyOn(sessionApi, 'post')
      .mockReturnValue(refreshRequest as never);

    const first = refreshSession();
    const second = refreshSession({ notifyOnFailure: true });

    expect(first).toBe(second);
    await Promise.resolve();
    expect(postSpy).toHaveBeenCalledTimes(1);

    resolveRefresh?.();
    await Promise.all([first, second]);
  });

  it('공유 갱신 참여자 중 하나가 요청하면 실패를 한 번 알린다', async () => {
    const error = new Error('refresh 실패');
    let rejectRefresh: ((reason: unknown) => void) | undefined;
    const refreshRequest = new Promise<void>((_, reject) => {
      rejectRefresh = reject;
    });
    vi.spyOn(sessionApi, 'post').mockReturnValue(refreshRequest as never);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const silent = refreshSession();
    const notifying = refreshSession({ notifyOnFailure: true });
    rejectRefresh?.(error);

    await expect(silent).rejects.toBe(error);
    await expect(notifying).rejects.toBe(error);

    const authEvents = dispatchSpy.mock.calls.filter(
      ([event]) => (event as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvents).toHaveLength(1);
  });

  it('실패한 갱신이 정리되면 다음 호출은 새 요청을 시작해야 한다', async () => {
    const postSpy = vi
      .spyOn(sessionApi, 'post')
      .mockRejectedValueOnce(new Error('첫 갱신 실패'))
      .mockResolvedValueOnce({ status: 200 });

    await expect(refreshSession()).rejects.toThrow('첫 갱신 실패');
    await expect(refreshSession()).resolves.toBeUndefined();

    expect(postSpy).toHaveBeenCalledTimes(2);
  });

  it('갱신 중 로그아웃은 같은 세션 큐에서 갱신 완료 후 실행해야 한다', async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshRequest = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const postSpy = vi
      .spyOn(sessionApi, 'post')
      .mockReturnValueOnce(refreshRequest as never)
      .mockResolvedValueOnce({ status: 204 });

    const refresh = refreshSession();
    const logout = clearServerSession();
    await Promise.resolve();

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenNthCalledWith(1, '/auth/refresh');

    resolveRefresh?.();
    await refresh;
    await logout;

    expect(postSpy).toHaveBeenNthCalledWith(2, '/auth/logout', undefined, {});
  });

  it('지원 브라우저에서는 탭 간 세션 작업에 Web Lock을 사용해야 한다', async () => {
    const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const request = vi.fn(
      async <T>(_name: string, operation: () => Promise<T>): Promise<T> =>
        operation(),
    );
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });
    vi.spyOn(sessionApi, 'post').mockResolvedValue({ status: 200 });

    try {
      await refreshSession();
      await clearServerSession();
    } finally {
      if (originalLocks) {
        Object.defineProperty(navigator, 'locks', originalLocks);
      } else {
        Reflect.deleteProperty(navigator, 'locks');
      }
    }

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(
      1,
      'filmott-auth-session',
      expect.any(Function),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'filmott-auth-session',
      expect.any(Function),
    );
  });
});
