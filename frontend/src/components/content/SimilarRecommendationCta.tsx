'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { trackEvent } from '@/lib/ga';
import { MAX_CHAT_MESSAGE_LENGTH } from '@/lib/chat-constraints';

interface SimilarRecommendationCtaProps {
  title: string;
  tmdbId: number;
  contentType: 'movie' | 'tv';
}

export function buildSimilarRecommendationPrompt(title: string): string {
  const suffix = ' 같은 느낌의 작품 추천해줘';
  const titleLengthLimit = MAX_CHAT_MESSAGE_LENGTH - Array.from(suffix).length;
  const safeTitle = Array.from(title.trim())
    .slice(0, titleLengthLimit)
    .join('');
  return `${safeTitle}${suffix}`;
}

export default function SimilarRecommendationCta({
  title,
  tmdbId,
  contentType,
}: SimilarRecommendationCtaProps) {
  const { user } = useAuth();
  const prompt = buildSimilarRecommendationPrompt(title);
  const href = `/?chatPrompt=${encodeURIComponent(prompt)}#chat-section`;

  return (
    <Link
      href={href}
      onClick={() => {
        trackEvent('detail_action_clicked', {
          action: 'ai_recommendation',
          content_type: contentType,
          tmdb_id: tmdbId,
          authenticated: user ? 1 : 0,
        });
      }}
      className="group block rounded-2xl bg-gradient-to-r from-fuchsia-700 to-indigo-600 p-px"
    >
      <div className="flex items-center gap-3 rounded-[15px] bg-[#0b0b0d] px-4 py-4 transition-colors group-hover:bg-[#111116] sm:px-5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-700/30 to-indigo-600/30">
          <Sparkles className="h-5 w-5 text-fuchsia-300" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-white/50">
            이 작품이 마음에 들었다면
          </span>
          <span className="mt-0.5 block text-sm font-semibold text-white sm:text-base">
            내 취향에 맞는 비슷한 작품 추천받기
          </span>
        </span>
      </div>
    </Link>
  );
}
