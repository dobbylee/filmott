import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthCallback } from '@/hooks/useAuthCallback';

const mockReplaceState = vi.fn();
Object.defineProperty(window, 'history', {
  value: { replaceState: mockReplaceState },
  writable: true,
});

const mockSessionGet = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {},
  refreshApi: {
    get: (...args: unknown[]) => mockSessionGet(...args),
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

  describe('기존 유저 callback 처리', () => {
    it('status=success면 /users/me로 세션을 확인한다', async () => {
      const mockUser = { id: 1, nickname: 'testuser', role: 'USER' };
      mockSessionGet.mockResolvedValue({ data: mockUser });

      const { result } = renderHook(() =>
        useAuthCallback({
          status: 'success',
          isNew: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
      );

      await waitFor(() => {
        expect(mockSessionGet).toHaveBeenCalledWith('/users/me');
      });

      await waitFor(() => {
        expect(mockOnAuthSuccess).toHaveBeenCalledWith({ user: mockUser });
        expect(mockReplaceState).toHaveBeenCalled();
        expect(mockOnRedirect).toHaveBeenCalledWith('/');
        expect(result.current.type).toBe('success');
      });
    });

    it('세션 확인 실패 시 에러 상태를 반환한다', async () => {
      mockSessionGet.mockRejectedValue(new Error('session failed'));

      const { result } = renderHook(() =>
        useAuthCallback({
          status: 'success',
          isNew: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
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
    it('new=true 파라미터로 nickname 상태를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          status: null,
          isNew: 'true',
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
      );

      expect(result.current.type).toBe('nickname');
      expect(mockReplaceState).toHaveBeenCalled();
    });
  });

  describe('에러 처리', () => {
    it('social_auth_failed 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          status: null,
          isNew: null,
          error: 'social_auth_failed',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('소셜 인증에 실패했습니다. 다시 시도해주세요.');
      }
    });

    it('알 수 없는 에러 코드일 때 기본 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          status: null,
          isNew: null,
          error: 'unknown_error',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    });

    it('suspended 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          status: null,
          isNew: null,
          error: 'suspended',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('정지된 계정입니다.');
      }
    });

    it('deleted 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          status: null,
          isNew: null,
          error: 'deleted',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
      );

      expect(result.current.type).toBe('error');
      if (result.current.type === 'error') {
        expect(result.current.message).toBe('삭제된 계정입니다.');
      }
    });

    it('missing_code 에러 메시지를 반환한다', () => {
      const { result } = renderHook(() =>
        useAuthCallback({
          status: null,
          isNew: null,
          error: 'missing_code',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
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
          status: null,
          isNew: null,
          error: null,
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
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
          status: null,
          isNew: null,
          error: 'social_auth_failed',
          onAuthSuccess: mockOnAuthSuccess,
          onRedirect: mockOnRedirect,
        }),
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
