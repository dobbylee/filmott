import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
});
