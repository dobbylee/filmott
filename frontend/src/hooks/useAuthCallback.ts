import { useEffect, useRef, useState } from 'react';
import { refreshApi } from '@/lib/api';
import type { AuthResponse, User } from '@/types/auth';

export type CallbackState =
  | { type: 'loading' }
  | { type: 'nickname' }
  | { type: 'error'; message: string }
  | { type: 'success' };

const ERROR_MESSAGES: Record<string, string> = {
  social_auth_failed: '소셜 인증에 실패했습니다. 다시 시도해주세요.',
  invalid_state: '잘못된 요청입니다. 다시 시도해주세요.',
  missing_code: '인증 코드가 누락되었습니다. 다시 시도해주세요.',
  provider_error: '소셜 서비스 연결에 실패했습니다.',
  suspended: '정지된 계정입니다.',
  deleted: '삭제된 계정입니다.',
};

function getErrorText(reason: string): string {
  return ERROR_MESSAGES[reason] || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
}

interface UseAuthCallbackParams {
  status: string | null;
  isNew: string | null;
  error: string | null;
  onAuthSuccess: (data: AuthResponse) => void;
  onRedirect: (path: string) => void;
}

export function useAuthCallback({
  status,
  isNew,
  error,
  onAuthSuccess,
  onRedirect,
}: UseAuthCallbackParams): CallbackState {
  const [asyncState, setAsyncState] = useState<CallbackState>({ type: 'loading' });
  const onAuthSuccessRef = useRef(onAuthSuccess);
  const onRedirectRef = useRef(onRedirect);

  useEffect(() => {
    onAuthSuccessRef.current = onAuthSuccess;
    onRedirectRef.current = onRedirect;
  }, [onAuthSuccess, onRedirect]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        onRedirectRef.current('/');
      }, 3000);
      return () => clearTimeout(timer);
    }

    if (status === 'success') {
      let active = true;
      let redirectTimer: ReturnType<typeof setTimeout> | undefined;

      (async () => {
        try {
          const { data } = await refreshApi.get<User>('/users/me');
          if (!active) return;

          onAuthSuccessRef.current({ user: data });
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/auth/callback');
          }
          setAsyncState({ type: 'success' });
          onRedirectRef.current('/');
        } catch {
          if (!active) return;

          setAsyncState({ type: 'error', message: getErrorText('social_auth_failed') });
          redirectTimer = setTimeout(() => onRedirectRef.current('/'), 3000);
        }
      })();

      return () => {
        active = false;
        if (redirectTimer) {
          clearTimeout(redirectTimer);
        }
      };
    }

    if (isNew === 'true') {
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/auth/callback');
      }
      return;
    }

    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setAsyncState({ type: 'error', message: '잘못된 접근입니다.' });
      redirectTimer = setTimeout(() => onRedirectRef.current('/'), 3000);
    }, 500);
    return () => {
      clearTimeout(timer);
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [status, isNew, error]);

  if (error) {
    return { type: 'error', message: getErrorText(error) };
  }

  if (isNew === 'true') {
    return { type: 'nickname' };
  }

  return asyncState;
}
