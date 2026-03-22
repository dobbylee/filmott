'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { revalidateContentDetail } from '@/app/contents/[type]/[tmdbId]/actions';

interface AdultBlockButtonProps {
  tmdbId: number;
  contentType: string;
  initialAdult: boolean;
}

export default function AdultBlockButton({
  tmdbId,
  contentType,
  initialAdult,
}: AdultBlockButtonProps) {
  const { user } = useAuth();
  const [isAdult, setIsAdult] = useState(initialAdult);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  const action = isAdult ? '차단 해제' : '성인물 차단';

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await api.patch('/contents/adult', {
        tmdbId,
        contentType,
        adult: !isAdult,
      });
      setIsAdult(!isAdult);
      await revalidateContentDetail(contentType, String(tmdbId));
    } catch {
      setError(`${action}에 실패했습니다.`);
    } finally {
      setIsLoading(false);
      setShowModal(false);
    }
  };

  return (
    <>
      {isLoading ? (
        <button
          disabled
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/60"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          처리 중...
        </button>
      ) : isAdult ? (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-300 transition-colors hover:bg-green-500/20"
        >
          <ShieldCheck className="h-4 w-4" />
          차단 해제
        </button>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
        >
          <ShieldAlert className="h-4 w-4" />
          성인물 차단
        </button>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6">
            <h3 className="mb-3 text-base font-bold text-white">{action}</h3>
            <p className="mb-5 text-sm text-white/60">
              이 작품을 {action}하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 ${
                  isAdult
                    ? 'bg-green-600 hover:opacity-90'
                    : 'bg-red-600 hover:opacity-90'
                }`}
              >
                {isLoading ? '처리 중...' : '확인'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={isLoading}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
