'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Plus, Pencil } from 'lucide-react';
import CommentIcon from '@/components/icons/CommentIcon';
import LikeButton from '@/components/review/LikeButton';
import ReviewCommentsModal from '@/components/review/ReviewCommentsModal';
import ReviewFormModal from '@/components/review/ReviewFormModal';
import WatchedDateModal from '@/components/watchlist/WatchedDateModal';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { WatchlistItem } from '@/types/watchlist';

interface WatchlistCardProps {
  item: WatchlistItem;
  initialLiked?: boolean;
  onMutate?: () => void;
}

function getDay(dateStr: string | null): string {
  if (!dateStr) return '';
  return String(new Date(dateStr).getDate());
}

export default function WatchlistCard({ item, initialLiked = false, onMutate }: WatchlistCardProps) {
  const { user } = useAuth();
  const { content, status, watchedAt, review } = item;
  const reviewWithUser = review && user ? { ...review, user: review.user ?? user } : review;
  const href = `/contents/${content.contentType}/${content.tmdbId}`;
  const posterSrc = content.posterUrl
    ? (content.posterUrl.startsWith('http') ? content.posterUrl : `${TMDB_IMAGE_BASE}/w154${content.posterUrl}`)
    : null;
  const [showComments, setShowComments] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showDateEdit, setShowDateEdit] = useState(false);

  return (
    <>
      <div className="group relative flex gap-4 rounded-2xl border border-white/[0.03] bg-white/[0.02] p-4 hover:bg-white/5 transition-colors">
        {/* 일(day) 숫자 + 구분선 */}
        {status === 'watched' && (
          <>
            <button
              onClick={() => setShowDateEdit(true)}
              className="flex-shrink-0 flex flex-col items-center justify-center w-[50px] gap-1 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors"
              title="감상 날짜 수정"
            >
              <span className="text-3xl font-bold text-white/80 hover:text-fuchsia-400 transition-colors">
                {getDay(watchedAt)}
              </span>
              <Pencil className="h-3 w-3 text-white/30" />
            </button>
            <div className="flex-shrink-0 w-px bg-white/10" />
          </>
        )}

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
                {review ? (
                  <>
                    <div className="flex items-center gap-3">
                      {review.rating != null && (
                        <div className="flex items-center gap-0.5">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="text-xs font-semibold">{review.rating}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setShowComments(true)}
                        className="flex items-center gap-0.5 hover:text-white transition-colors"
                      >
                        <CommentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">{review.commentsCount ?? 0}</span>
                      </button>
                    </div>
                    {review.comment && (
                      <p className="mt-2 text-sm leading-relaxed text-white/70 line-clamp-2">
                        {review.comment}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center h-full">
                    <div className="rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 p-[1px] hover:opacity-80 transition-opacity">
                      <button
                        onClick={() => setShowReviewForm(true)}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-card px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        리뷰 작성
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 오른쪽: 좋아요 / 영화·연도 */}
              <div className="flex flex-col items-end justify-between flex-shrink-0">
                {review && (
                  <LikeButton
                    reviewId={review.id}
                    initialCount={review.likesCount}
                    initialLiked={initialLiked}
                    size="md"
                  />
                )}
                <span className="mt-auto text-xs text-white/30">
                  {content.contentType === 'movie' ? '영화' : '시리즈'}
                  {content.releaseDate && ` · ${content.releaseDate.slice(0, 4)}`}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {showComments && reviewWithUser && (
        <ReviewCommentsModal
          review={reviewWithUser}
          onClose={() => setShowComments(false)}
        />
      )}

      {showReviewForm && (
        <ReviewFormModal
          contentId={item.contentId}
          onClose={() => setShowReviewForm(false)}
          onMutate={onMutate}
        />
      )}

      {showDateEdit && (
        <WatchedDateModal
          onConfirm={async (date) => {
            try {
              await api.patch(`/watchlist/${item.id}`, { watchedAt: date });
              onMutate?.();
            } catch {
              // ignore
            } finally {
              setShowDateEdit(false);
            }
          }}
          onCancel={() => setShowDateEdit(false)}
        />
      )}
    </>
  );
}
