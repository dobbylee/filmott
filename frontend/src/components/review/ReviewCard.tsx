'use client';

import { useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import CommentIcon from '@/components/icons/CommentIcon';
import LikeButton from './LikeButton';
import ReviewCommentsModal from './ReviewCommentsModal';
import api from '@/lib/api';
import type { Review } from '@/types/review';
import { getDisplayNickname, isDeletedUser } from '@/utils/user';
import UserAvatar from '@/components/common/UserAvatar';

interface ReviewCardProps {
  review: Review;
  showInteractions?: boolean;
  initialLiked?: boolean;
  isAdmin?: boolean;
  onDelete?: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ReviewCard({ review, showInteractions = true, initialLiked = false, isAdmin = false, onDelete }: ReviewCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleAdminDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/reviews/${review.id}`);
      onDelete?.();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4">
        {/* 상단: 아바타 + 닉네임 + 별점 + 댓글 (왼쪽) / 좋아요 (오른쪽) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserAvatar user={review.user} size="lg" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-medium ${isDeletedUser(review.user) ? 'text-muted-foreground' : ''}`}>{getDisplayNickname(review.user)}</span>
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

        {/* ADMIN 삭제 */}
        {isAdmin && !showDeleteConfirm && (
          <div className="mt-3 flex items-center justify-end">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              삭제
            </button>
          </div>
        )}
        {isAdmin && showDeleteConfirm && (
          <div className="mt-3 rounded-xl border border-red-500/20 bg-white/[0.02] p-4">
            <p className="text-sm text-red-400">정말 삭제하시겠습니까?</p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={handleAdminDelete}
                disabled={deleting}
                className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                삭제
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/50 hover:bg-white/5 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
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
