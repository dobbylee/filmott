'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import StarRating from './StarRating';
import type { Review } from '@/types/review';
import type { WatchlistStatusResponse } from '@/types/watchlist';
import { useFocusTrap } from '@/utils/useFocusTrap';
import { trackEvent } from '@/lib/ga';
import { getKoreaDateInputValue } from '@/utils/date';

interface ReviewFormModalProps {
  contentId: number;
  existingReview?: Review | null;
  initialWatchedAt?: string | null;
  forceWatchedAtInput?: boolean;
  onClose: () => void;
  onMutate?: () => void;
}

function getTodayDateInputValue(): string {
  return getKoreaDateInputValue();
}

function toDateInputValue(date: string | null | undefined): string {
  if (!date) return getTodayDateInputValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return getTodayDateInputValue();
  return getKoreaDateInputValue(parsed);
}

export default function ReviewFormModal({
  contentId,
  existingReview,
  initialWatchedAt,
  forceWatchedAtInput = false,
  onClose,
  onMutate,
}: ReviewFormModalProps) {
  const router = useRouter();
  const isEditing = existingReview != null;
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [comment, setComment] = useState(existingReview?.comment ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const initialWatchedAtValue = initialWatchedAt ?? existingReview?.watchedAt;
  const hasProvidedWatchedAt = initialWatchedAt != null || existingReview?.watchedAt != null;
  const [watchedAt, setWatchedAt] = useState(() => toDateInputValue(initialWatchedAtValue));
  const showWatchedAtInput = true;
  const modalRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    setWatchedAt(toDateInputValue(initialWatchedAtValue));
  }, [initialWatchedAtValue]);

  // 기존 watched 기록이 있으면 감상일을 기본값으로 사용한다.
  useEffect(() => {
    if (forceWatchedAtInput || hasProvidedWatchedAt) return;
    api.get<WatchlistStatusResponse>(`/watchlist/me/status?contentId=${contentId}`)
      .then((res) => {
        if (res.data.watchedAt) {
          setWatchedAt(toDateInputValue(res.data.watchedAt));
        }
      })
      .catch(() => {});
  }, [contentId, forceWatchedAtInput, hasProvidedWatchedAt]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

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
          comment,
          watchedAt,
        });
      } else {
        await api.post('/reviews', {
          contentId,
          rating,
          comment: comment || undefined,
          ...(showWatchedAtInput ? { watchedAt } : {}),
        });
      }
      if (!isEditing) {
        trackEvent('review_created', { content_id: contentId });
      }
      onMutate?.();
      window.dispatchEvent(new Event('watchlist-updated'));
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
      <div ref={modalRef} className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
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
          {showWatchedAtInput && (
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">감상 날짜</label>
              <input
                type="date"
                value={watchedAt}
                max={getTodayDateInputValue()}
                onChange={(e) => setWatchedAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary [color-scheme:dark]"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">별점</label>
            <StarRating value={rating} onChange={(v) => { setRating(v); if (error) setError(''); }} />
            {error && rating === 0 && (
              <p className="mt-1.5 text-xs text-destructive">{error}</p>
            )}
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

          {error && rating > 0 && (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            {isEditing && existingReview.likesCount > 0 && (rating !== existingReview.rating || comment !== (existingReview.comment ?? '')) && (
              <div className="mr-auto flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                수정 시 좋아요({existingReview.likesCount}개) 초기화
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? '저장 중...' : isEditing ? '수정' : '작성'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
