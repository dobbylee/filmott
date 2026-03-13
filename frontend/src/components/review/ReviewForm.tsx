'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Plus } from 'lucide-react';
import CommentIcon from '@/components/icons/CommentIcon';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import LikeButton from './LikeButton';
import ReviewFormModal from './ReviewFormModal';
import ReviewCommentsModal from './ReviewCommentsModal';
import type { Review } from '@/types/review';

interface ReviewFormProps {
  contentId: number;
  existingReview?: Review | null;
  initialLiked?: boolean;
  onMutate?: () => void;
}

export default function ReviewForm({ contentId, existingReview, initialLiked = false, onMutate }: ReviewFormProps) {
  const { user, isLoading: authLoading, openAuthModal } = useAuth();
  const router = useRouter();
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasExisting = existingReview != null;

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDeleteConfirm(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showDeleteConfirm]);

  if (authLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="h-5 w-40 rounded bg-white/5 animate-pulse mx-auto" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">
          리뷰를 남기려면{' '}
          <button
            onClick={() => openAuthModal('login')}
            className="text-primary hover:underline"
          >
            로그인
          </button>
          하세요.
        </p>
      </div>
    );
  }

  function handleEditClick() {
    if (!existingReview) return;
    setShowFormModal(true);
  }

  function handleDeleteClick() {
    setShowDeleteConfirm(true);
  }

  async function handleDelete() {
    if (!existingReview) return;
    setIsSubmitting(true);
    try {
      await api.delete(`/reviews/${existingReview.id}`);
      setShowDeleteConfirm(false);
      onMutate?.();
      router.refresh();
    } catch {
      setError('삭제에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // 기존 리뷰 카드
  if (hasExisting) {
    return (
      <>
        <div className="rounded-lg border border-border bg-card p-4">
          {/* 상단: 내 리뷰 뱃지 + 별점 + 댓글 (왼쪽) / 좋아요 (오른쪽) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded bg-gradient-to-r from-fuchsia-600 to-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white">내 리뷰</span>
              {existingReview.rating != null && (
                <div className="flex items-center gap-0.5">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-semibold">{existingReview.rating}</span>
                </div>
              )}
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <CommentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">{existingReview.commentsCount ?? 0}</span>
              </button>
            </div>

            <LikeButton
              reviewId={existingReview.id}
              initialCount={existingReview.likesCount}
              initialLiked={initialLiked}
              size="md"
            />
          </div>

          {/* 코멘트 */}
          {existingReview.comment && (
            <p className="mt-3 text-sm leading-relaxed text-card-foreground">
              {existingReview.comment}
            </p>
          )}

          {/* 하단: 수정/삭제 */}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={handleEditClick}
              className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-fuchsia-600 to-blue-500 px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium text-white hover:opacity-80 transition-all"
            >
              수정
            </button>
            <button
              onClick={handleDeleteClick}
              className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              삭제
            </button>
          </div>

          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

          {/* 삭제 확인 */}
          {showDeleteConfirm && (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-white/[0.02] p-4">
              <p className="text-sm text-red-400">정말 삭제하시겠습니까?</p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isSubmitting}
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

        {showFormModal && (
          <ReviewFormModal
            contentId={contentId}
            existingReview={existingReview}
            onClose={() => setShowFormModal(false)}
            onMutate={onMutate}
          />
        )}

        {showComments && (
          <ReviewCommentsModal
            review={existingReview}
            onClose={() => setShowComments(false)}
          />
        )}
      </>
    );
  }

  // 작성 버튼
  return (
    <>
      <div className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-blue-500 p-[1px] hover:opacity-80 transition-opacity">
        <button
          onClick={() => setShowFormModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-card p-3 text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          리뷰 작성
        </button>
      </div>

      {showFormModal && (
        <ReviewFormModal
          contentId={contentId}
          onClose={() => setShowFormModal(false)}
          onMutate={onMutate}
        />
      )}
    </>
  );
}
