'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthCallback } from '@/hooks/useAuthCallback';
import NicknameSetupModal from '@/components/auth/NicknameSetupModal';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleAuthSuccess } = useAuth();

  const state = useAuthCallback({
    token: searchParams.get('token'),
    refresh: searchParams.get('refresh'),
    isNew: searchParams.get('new'),
    tempToken: searchParams.get('tempToken'),
    error: searchParams.get('error'),
    onAuthSuccess: handleAuthSuccess,
    onRedirect: (path) => router.replace(path),
  });

  if (state.type === 'nickname') {
    return <NicknameSetupModal tempToken={state.tempToken} />;
  }

  if (state.type === 'error') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-6 py-4 text-center">
          <p className="text-red-400" data-testid="error-message">{state.message}</p>
          <p className="mt-2 text-sm text-white/40">잠시 후 메인 페이지로 이동합니다...</p>
        </div>
      </div>
    );
  }

  // 로딩 상태 또는 성공 후 리다이렉트 대기
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      <p className="text-sm text-white/50">로그인 처리 중...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          <p className="text-sm text-white/50">로그인 처리 중...</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
