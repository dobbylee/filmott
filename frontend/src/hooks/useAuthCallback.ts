import { useEffect, useRef, useState } from 'react';
import type { AuthResponse } from '@/types/auth';

export type CallbackState =
  | { type: 'loading' }
  | { type: 'nickname'; tempToken: string }
  | { type: 'error'; message: string }
  | { type: 'success' };

const ERROR_MESSAGES: Record<string, string> = {
  social_auth_failed: '소셜 인증에 실패했습니다. 다시 시도해주세요.',
  invalid_state: '잘못된 요청입니다. 다시 시도해주세요.',
  provider_error: '소셜 서비스 연결에 실패했습니다.',
  suspended: '정지된 계정입니다.',
  deleted: '삭제된 계정입니다.',
};

function getErrorText(reason: string): string {
  return ERROR_MESSAGES[reason] || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
}

interface UseAuthCallbackParams {
  token: string | null;
  refresh: string | null;
  isNew: string | null;
  tempToken: string | null;
  error: string | null;
  onAuthSuccess: (data: AuthResponse) => void;
  onRedirect: (path: string) => void;
}

export function useAuthCallback({
  token,
  refresh,
  isNew,
  tempToken,
  error,
  onAuthSuccess,
  onRedirect,
}: UseAuthCallbackParams): CallbackState {
  const [state, setState] = useState<CallbackState>({ type: 'loading' });
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;

    // 에러 처리
    if (error) {
      processed.current = true;
      setState({ type: 'error', message: getErrorText(error) });
      const timer = setTimeout(() => {
        onRedirect('/');
      }, 3000);
      return () => clearTimeout(timer);
    }

    // 기존 유저: 토큰 저장 + 메인 이동
    if (token && refresh) {
      processed.current = true;
      try {
        const base64 = token.split('.')[1];
        const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))));
        onAuthSuccess({
          access_token: token,
          refresh_token: refresh,
          user: {
            id: payload.sub,
            nickname: payload.nickname || '',
            email: payload.email || null,
            provider: payload.provider || undefined,
          },
        });
      } catch {
        localStorage.setItem('access_token', token);
        localStorage.setItem('refresh_token', refresh);
      }
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/auth/callback');
      }
      setState({ type: 'success' });
      onRedirect('/');
      return;
    }

    // 신규 유저: 닉네임 설정 모달 표시
    if (isNew === 'true' && tempToken) {
      processed.current = true;
      setState({ type: 'nickname', tempToken });
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/auth/callback');
      }
      return;
    }

    // 파라미터 없음: 에러 (초기 로딩 시 searchParams가 아직 없을 수 있으므로 지연 처리)
    const timer = setTimeout(() => {
      if (!processed.current) {
        processed.current = true;
        setState({ type: 'error', message: '잘못된 접근입니다.' });
        setTimeout(() => onRedirect('/'), 3000);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [token, refresh, isNew, tempToken, error, onAuthSuccess, onRedirect]);

  return state;
}
