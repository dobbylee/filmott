'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import CommentIcon from '@/components/icons/CommentIcon';
import LikeButton from './LikeButton';
import ReviewCommentsModal from './ReviewCommentsModal';
import type { Review } from '@/types/review';

interface ReviewCardProps {
  review: Review;
  showInteractions?: boolean;
  initialLiked?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ReviewCard({ review, showInteractions = true, initialLiked = false }: ReviewCardProps) {
  const [showComments, setShowComments] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4">
        {/* 상단: 아바타 + 닉네임 + 별점 + 댓글 (왼쪽) / 좋아요 (오른쪽) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {review.user?.nickname?.charAt(0) ?? '?'}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{review.user?.nickname ?? '익명'}</span>
                {review.rating != null && (
                  <div className="flex items-center gap-0.5">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-semibold">{review.rating}</span>
                  </div>
                )}
                {showInteractions && (
                  <button
                    onClick={() => setShowComments(true)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors ml-0.5"
                  >
                    <CommentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold">{review.commentsCount ?? 0}</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
            </div>
          </div>

          {showInteractions ? (
            <LikeButton
              reviewId={review.id}
              initialCount={review.likesCount}
              initialLiked={initialLiked}
              size="md"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {review.likesCount} 좋아요
            </span>
          )}
        </div>

        {/* 코멘트 */}
        {review.comment && (
          <p className="mt-3 text-sm leading-relaxed text-card-foreground">
            {review.comment}
          </p>
        )}
      </div>

      {showComments && (
        <ReviewCommentsModal
          review={review}
          onClose={() => setShowComments(false)}
        />
      )}
    </>
  );
}
