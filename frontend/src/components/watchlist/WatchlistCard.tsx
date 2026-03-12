'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Check, Trash2, Calendar } from 'lucide-react';
import CommentIcon from '@/components/icons/CommentIcon';
import LikeButton from '@/components/review/LikeButton';
import ReviewCommentsModal from '@/components/review/ReviewCommentsModal';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { WatchlistItem } from '@/types/watchlist';

interface WatchlistCardProps {
  item: WatchlistItem;
  initialLiked?: boolean;
  onMarkWatched?: (id: number) => void;
  onRemove?: (id: number) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function WatchlistCard({ item, initialLiked = false, onMarkWatched, onRemove }: WatchlistCardProps) {
  const { content, status, watchedAt, createdAt, review } = item;
  const href = `/contents/${content.contentType}/${content.tmdbId}`;
  const posterSrc = content.posterUrl
    ? (content.posterUrl.startsWith('http') ? content.posterUrl : `${TMDB_IMAGE_BASE}/w154${content.posterUrl}`)
    : null;
  const [showComments, setShowComments] = useState(false);

  return (
    <>
      <div className="group relative flex gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 hover:bg-white/10 transition-colors backdrop-blur-sm">
        {/* Poster + Title */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
          <Link href={href} className="relative h-[100px] w-[66px] overflow-hidden rounded-lg shadow-lg">
            {posterSrc ? (
              <Image
                src={posterSrc}
                alt={content.title}
                fill
                sizes="66px"
                className="object-cover group-hover:scale-110 transition-transform duration-500"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-[10px] text-white/30">
                No Image
              </div>
            )}
          </Link>
          <Link href={href} className="w-[80px] text-center">
            <p className="text-sm font-medium text-white/90 truncate hover:text-fuchsia-400 transition-colors">
              {content.title}
            </p>
          </Link>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col">
          {status === 'watched' ? (
            <div className="flex gap-3 h-full">
              {/* 왼쪽: 리뷰 정보 */}
              <div className="flex-1 min-w-0 flex flex-col">
                {/* 내 리뷰 + 별점 + 댓글 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                    내 리뷰
                  </span>
                  {review?.rating != null && (
                    <div className="flex items-center gap-0.5">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-semibold">{review.rating}</span>
                    </div>
                  )}
                  {review && (
                    <button
                      onClick={() => setShowComments(true)}
                      className="flex items-center gap-0.5 hover:text-white transition-colors"
                    >
                      <CommentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">{review.commentsCount ?? 0}</span>
                    </button>
                  )}
                </div>

                {/* 코멘트 */}
                {review?.comment && (
                  <p className="mt-3 px-3 text-sm leading-relaxed text-white/70 line-clamp-2">
                    {review.comment}
                  </p>
                )}
              </div>

              {/* 오른쪽: 영화·연도 / 좋아요 / 감상일 (수직 배치) */}
              <div className="flex flex-col items-end justify-between flex-shrink-0">
                <span className="text-xs text-white/30">
                  {content.contentType === 'movie' ? '영화' : '시리즈'}
                  {content.releaseDate && ` · ${content.releaseDate.slice(0, 4)}`}
                </span>
                {review && (
                  <LikeButton
                    reviewId={review.id}
                    initialCount={review.likesCount}
                    initialLiked={initialLiked}
                    size="sm"
                  />
                )}
                <div className="flex items-center gap-1 text-xs text-white/40">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(watchedAt)}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 감상할 작품: 추가일 + 타입 */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-white/40" />
                  <span className="text-xs text-white/50">추가일 {formatDate(createdAt)}</span>
                </div>
                <span className="text-xs text-white/30">
                  {content.contentType === 'movie' ? '영화' : '시리즈'}
                  {content.releaseDate && ` · ${content.releaseDate.slice(0, 4)}`}
                </span>
              </div>

              {/* Action buttons */}
              <div className="mt-auto pt-3 flex gap-2">
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
            </>
          )}
        </div>
      </div>

      {showComments && review && (
        <ReviewCommentsModal
          review={review}
          onClose={() => setShowComments(false)}
        />
      )}
    </>
  );
}
