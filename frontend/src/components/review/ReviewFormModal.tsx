'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import StarRating from './StarRating';
import type { Review } from '@/types/review';

interface ReviewFormModalProps {
  contentId: number;
  existingReview?: Review | null;
  onClose: () => void;
  onMutate?: () => void;
}

export default function ReviewFormModal({ contentId, existingReview, onClose, onMutate }: ReviewFormModalProps) {
  const router = useRouter();
  const isEditing = existingReview != null;
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [comment, setComment] = useState(existingReview?.comment ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('별점을 선택해주세요.');
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      if (isEditing) {
        await api.patch(`/reviews/${existingReview.id}`, {
          rating,
          comment: comment || undefined,
        });
      } else {
        await api.post('/reviews', {
          contentId,
          rating,
          comment: comment || undefined,
        });
      }
      onMutate?.();
      router.refresh();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? '리뷰 저장에 실패했습니다.';
      setError(typeof msg === 'string' ? msg : '리뷰 저장에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-4 text-base font-bold">
          {isEditing ? '리뷰 수정' : '리뷰 작성'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">별점</label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              코멘트 (선택)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="작품에 대한 한마디를 남겨보세요."
              maxLength={500}
              rows={4}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {error && (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          )}

          {isEditing && existingReview.likesCount > 0 && rating !== existingReview.rating && (
            <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              수정 시 좋아요({existingReview.likesCount}개) 초기화
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={isSubmitting || rating === 0}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? '저장 중...' : isEditing ? '수정' : '등록'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
