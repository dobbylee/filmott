import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthCallback } from '@/hooks/useAuthCallback';

// window.history.replaceState mock
const mockReplaceState = vi.fn();
Object.defineProperty(window, 'history', {
  value: { replaceState: mockReplaceState },
  writable: true,
});

describe('useAuthCallback', () => {
  const mockOnAuthSuccess = vi.fn();
  const mockOnRedirect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('기존 유저 토큰 처리', () => {
    it('token과 refresh 파라미터로 onAuthSuccess를 호출한다', () => {
      const payload = { sub: 1, nickname: 'testuser', email: 'test@example.com', provider: 'GOOGLE' };
      const base64Payload = btoa(JSON.stringify(payload));
      const mockToken = `header.${base64Payload}.signature`;

      const { result } = renderHook(() =>
        useAuthCallback({
          token: mockToken,
          refresh: 'mock-refresh-token',
          isNew: null,
          tempToken: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(mockOnAuthSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: mockToken,
          refresh_token: 'mock-refresh-token',
          user: expect.objectContaining({
            id: 1,
            nickname: 'testuser',
          }),
        })
      );
      expect(mockReplaceState).toHaveBeenCalled();
      expect(mockOnRedirect).toHaveBeenCalledWith('/');
      expect(result.current.type).toBe('success');
    });

    it('JWT 파싱 실패 시에도 토큰을 localStorage에 저장한다', () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
      const invalidToken = 'not.a.valid.jwt';

      renderHook(() =>
        useAuthCallback({
          token: invalidToken,
          refresh: 'mock-refresh-token',
          isNew: null,
          tempToken: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(mockSetItem).toHaveBeenCalledWith('access_token', invalidToken);
      expect(mockSetItem).toHaveBeenCalledWith('refresh_token', 'mock-refresh-token');
      mockSetItem.mockRestore();
    });
  });

  describe('신규 유저 닉네임 설정', () => {
    it('new=true와 tempToken 파라미터로 nickname 상태를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          token: null,
          refresh: null,
          isNew: 'true',
          tempToken: 'temp-token-xyz',
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(result.current.type).toBe('nickname');
      if (result.current.type === 'nickname') {
        expect(result.current.tempToken).toBe('temp-token-xyz');
      }
      expect(mockReplaceState).toHaveBeenCalled();
    });
  });

  describe('에러 처리', () => {
    it('social_auth_failed 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          token: null,
          refresh: null,
          isNew: null,
          tempToken: null,
          error: 'social_auth_failed',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('소셜 인증에 실패했습니다. 다시 시도해주세요.');
      }
    });

    it('알 수 없는 에러 코드일 때 기본 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          token: null,
          refresh: null,
          isNew: null,
          tempToken: null,
          error: 'unknown_error',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    });

    it('suspended 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          token: null,
          refresh: null,
          isNew: null,
          tempToken: null,
          error: 'suspended',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('정지된 계정입니다.');
      }
    });

    it('deleted 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          token: null,
          refresh: null,
          isNew: null,
          tempToken: null,
          error: 'deleted',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('삭제된 계정입니다.');
      }
    });

    it('파라미터가 없으면 잘못된 접근 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          token: null,
          refresh: null,
          isNew: null,
          tempToken: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('잘못된 접근입니다.');
      }
    });

    it('에러 시 3초 후 리다이렉트한다', () => {
      vi.useFakeTimers();

      renderHook(() =>
        useAuthCallback({
          token: null,
          refresh: null,
          isNew: null,
          tempToken: null,
          error: 'social_auth_failed',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(mockOnRedirect).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockOnRedirect).toHaveBeenCalledWith('/');

      vi.useRealTimers();
    });
  });
});
