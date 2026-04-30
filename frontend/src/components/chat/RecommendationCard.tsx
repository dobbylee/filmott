'use client';

import { useState } from 'react';
import TmdbImage, { replaceTmdbSize } from '@/components/common/TmdbImage';
import Link from 'next/link';
import { Bookmark, Check } from 'lucide-react';
import { TMDB_IMAGE_BASE } from '@/types/content';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import type { ChatRecommendationWithPoster } from '@/types/chat';

interface RecommendationCardProps {
  recommendation: ChatRecommendationWithPoster;
}

export default function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const { user, openAuthModal } = useAuth();
  const [added, setAdded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { tmdbId, contentType, title, posterUrl } = recommendation;
  const href = `/contents/${contentType}/${tmdbId}`;

  const handleWantToWatch = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      openAuthModal();
      return;
    }

    if (added || isLoading) return;

    setIsLoading(true);
    try {
      await api.post('/watchlist', {
        tmdbId,
        contentType,
        status: 'want_to_watch',
      });
      setAdded(true);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Link
      href={href}
      className="group flex-shrink-0 w-[140px] sm:w-[160px] block"
    >
      {/* 포스터 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-white/5 border border-white/10">
        {posterUrl ? (
          <TmdbImage
            src={posterUrl.startsWith('http') ? replaceTmdbSize(posterUrl, 'w342') : `${TMDB_IMAGE_BASE}/w342${posterUrl}`}
            alt={title}
            fill
            sizes="(max-width: 640px) 140px, 160px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/40">
            포스터 없음
          </div>
        )}

        {/* contentType 태그 */}
        <div className="absolute top-2 left-2 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white/80 border border-white/10">
          {contentType === 'tv' ? '시리즈' : '영화'}
        </div>

        {/* 보고싶어요 버튼 */}
        <button
          onClick={handleWantToWatch}
          disabled={added || isLoading}
          className={`absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
            added
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              : 'bg-black/60 text-white/70 hover:text-yellow-400 hover:bg-yellow-500/20 border border-white/10'
          }`}
          aria-label={added ? '추가됨' : '보고싶어요'}
        >
          {isLoading ? (
            <span className="w-3 h-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
          ) : added ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* 제목 */}
      <p className="mt-2 text-xs font-semibold text-white truncate group-hover:text-fuchsia-300 transition-colors">
        {title}
      </p>
    </Link>
  );
}
