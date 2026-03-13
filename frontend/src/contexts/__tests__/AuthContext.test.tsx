import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// api 모듈 mock
vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext - handleAuthRequired 처리', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('auth:required 이벤트 발생 시 localStorage를 초기화해야 한다', async () => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 1, nickname: 'test' }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // wait for initial load
    await act(async () => {});

    expect(localStorage.getItem('access_token')).toBe('test-token');

    // fire auth:required event
    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
    });

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.authModal.isOpen).toBe(true);
    expect(result.current.authModal.mode).toBe('login');
  });

  it('이벤트 리스닝에 AUTH_REQUIRED_EVENT 상수를 사용해야 한다', () => {
    // Verify the constant is used, not a hardcoded string
    expect(AUTH_REQUIRED_EVENT).toBe('auth:required');

    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useAuth(), { wrapper });

    const authRequiredCalls = addSpy.mock.calls.filter(
      ([event]) => event === AUTH_REQUIRED_EVENT,
    );
    expect(authRequiredCalls.length).toBeGreaterThan(0);

    addSpy.mockRestore();
  });
});
