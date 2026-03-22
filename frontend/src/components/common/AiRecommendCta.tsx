'use client';

import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function AiRecommendCta() {
  const { user, openAuthModal } = useAuth();
  const router = useRouter();

  const handleClick = () => {
    if (user) {
      router.push('/chat');
    } else {
      openAuthModal();
    }
  };

  return (
    <div className="flex items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-2.5">
      <p className="text-sm text-white/60">
        뭐 볼지 고민될 때
      </p>
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-fuchsia-700 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-[0_0_15px_rgba(192,38,211,0.3)] hover:shadow-[0_0_25px_rgba(192,38,211,0.5)] transition-all duration-300"
      >
        <Sparkles className="h-4 w-4" />
        추천받기
      </button>
    </div>
  );
}
