'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

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

  // ADMIN이 아니면 렌더링하지 않음
  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  const handleToggle = async () => {
    const action = isAdult ? '차단 해제' : '성인물 차단';
    const confirmed = window.confirm(
      `이 작품을 ${action}하시겠습니까?`,
    );
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await api.patch('/contents/adult', {
        tmdbId,
        contentType,
        adult: !isAdult,
      });
      setIsAdult(!isAdult);
    } catch {
      alert(`${action}에 실패했습니다.`);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <button
        disabled
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/60"
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        처리 중...
      </button>
    );
  }

  if (isAdult) {
    return (
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-300 transition-colors hover:bg-green-500/20"
      >
        <ShieldCheck className="h-4 w-4" />
        차단 해제
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
    >
      <ShieldAlert className="h-4 w-4" />
      성인물 차단
    </button>
  );
}
