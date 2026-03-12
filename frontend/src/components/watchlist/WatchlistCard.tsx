'use client';

import Link from 'next/link';
import { Star, Check, Trash2, Calendar } from 'lucide-react';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { WatchlistItem } from '@/types/watchlist';

interface WatchlistCardProps {
  item: WatchlistItem;
  onMarkWatched?: (id: number) => void;
  onRemove?: (id: number) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function WatchlistCard({ item, onMarkWatched, onRemove }: WatchlistCardProps) {
  const { content, status, watchedAt, createdAt, review } = item;
  const href = `/contents/${content.contentType}/${content.tmdbId}`;
  const posterSrc = content.posterUrl
    ? `${TMDB_IMAGE_BASE}/w185${content.posterUrl}`
    : null;

  return (
    <div className="flex gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors">
      {/* Poster */}
      <Link href={href} className="flex-shrink-0">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={content.title}
            className="h-28 w-[76px] rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-28 w-[76px] items-center justify-center rounded-lg bg-white/5 text-xs text-white/30">
            No Image
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-between min-w-0">
        <div>
          <Link href={href} className="group">
            <h3 className="text-sm font-semibold text-white group-hover:text-fuchsia-400 transition-colors line-clamp-1">
              {content.title}
            </h3>
          </Link>
          <p className="mt-0.5 text-xs text-white/40">
            {content.contentType === 'movie' ? '영화' : '시리즈'}
            {content.releaseDate && ` · ${content.releaseDate.slice(0, 4)}`}
          </p>

          {/* Date info */}
          <div className="mt-1.5 flex items-center gap-1 text-xs text-white/40">
            <Calendar className="h-3 w-3" />
            {status === 'watched' ? (
              <span>감상일 {formatDate(watchedAt)}</span>
            ) : (
              <span>추가일 {formatDate(createdAt)}</span>
            )}
          </div>

          {/* Review preview (watched only) */}
          {status === 'watched' && review && (
            <div className="mt-2 flex items-start gap-1.5">
              {review.rating && (
                <span className="flex items-center gap-0.5 text-xs text-yellow-400 shrink-0">
                  <Star className="h-3 w-3 fill-current" />
                  {review.rating.toFixed(1)}
                </span>
              )}
              {review.comment && (
                <p className="text-xs text-white/50 line-clamp-1">{review.comment}</p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons (want_to_watch only) */}
        {status === 'want_to_watch' && (
          <div className="mt-2 flex gap-2">
            {onMarkWatched && (
              <button
                onClick={() => onMarkWatched(item.id)}
                className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                감상 완료
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(item.id)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/50 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                제거
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
