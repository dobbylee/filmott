import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthCallback } from '@/hooks/useAuthCallback';

// window.history.replaceState mock
const mockReplaceState = vi.fn();
Object.defineProperty(window, 'history', {
  value: { replaceState: mockReplaceState },
  writable: true,
});

// api mock
const mockPost = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: vi.fn(),
  },
}));

describe('useAuthCallback', () => {
  const mockOnAuthSuccess = vi.fn();
  const mockOnRedirect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('기존 유저 code 교환 처리', () => {
    it('code 파라미터로 POST /auth/social/exchange를 호출한다', async () => {
      const mockResponse = {
        data: {
          user: { id: 1, nickname: 'testuser', role: 'USER' },
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        useAuthCallback({
          code: 'one-time-code-abc',
          isNew: null,
          tempToken: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      // 비동기 처리 대기 (Testing Library waitFor는 자동으로 act로 감쌈)
      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/auth/social/exchange', { code: 'one-time-code-abc' });
      });

      await waitFor(() => {
        expect(mockOnAuthSuccess).toHaveBeenCalledWith(mockResponse.data);
        expect(mockReplaceState).toHaveBeenCalled();
        expect(mockOnRedirect).toHaveBeenCalledWith('/');
        expect(result.current.type).toBe('success');
      });
    });

    it('code 교환 실패 시 에러 상태를 반환한다', async () => {
      mockPost.mockRejectedValue(new Error('exchange failed'));

      const { result } = renderHook(() =>
        useAuthCallback({
          code: 'invalid-code',
          isNew: null,
          tempToken: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      await waitFor(() => {
        expect(result.current.type).toBe('error');
        if (result.current.type === 'error') {
          expect(result.current.message).toBe('소셜 인증에 실패했습니다. 다시 시도해주세요.');
        }
      });
    });
  });

  describe('신규 유저 닉네임 설정', () => {
    it('new=true와 tempToken 파라미터로 nickname 상태를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          code: null,
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
          code: null,
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
          code: null,
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
          code: null,
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
          code: null,
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

    it('missing_code 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          code: null,
          isNew: null,
          tempToken: null,
          error: 'missing_code',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('인증 코드가 누락되었습니다. 다시 시도해주세요.');
      }
    });

    it('파라미터가 없으면 잘못된 접근 메시지를 반환한다', () => {
      vi.useFakeTimers();

      const { result } = renderHook(() =>
        useAuthCallback({
          code: null,
          isNew: null,
          tempToken: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        })
      );

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('잘못된 접근입니다.');
      }

      vi.useRealTimers();
    });

    it('에러 시 3초 후 리다이렉트한다', () => {
      vi.useFakeTimers();

      renderHook(() =>
        useAuthCallback({
          code: null,
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
