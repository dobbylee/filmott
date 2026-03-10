'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import StarRating from './StarRating';
import type { Review } from '@/types/review';

interface ReviewFormProps {
  contentId: number;
  existingReview?: Review | null;
}

export default function ReviewForm({ contentId, existingReview }: ReviewFormProps) {
  const { user, isLoading: authLoading, openAuthModal } = useAuth();
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [hasSpoiler, setHasSpoiler] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditWarning, setShowEditWarning] = useState(false);

  const hasExisting = existingReview != null;

  useEffect(() => {
    if (existingReview) {
      setRating(existingReview.rating ?? 0);
      setComment(existingReview.comment ?? '');
      setHasSpoiler(existingReview.hasSpoiler);
    }
  }, [existingReview]);

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
          한줄평을 남기려면{' '}
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

  if (hasExisting && !isEditing) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">내 한줄평</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (existingReview.likesCount > 0) {
                  setShowEditWarning(true);
                } else {
                  setIsEditing(true);
                }
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
              수정
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              삭제
            </button>
          </div>
        </div>
        {existingReview.rating != null && (
          <div className="mt-2 flex items-center gap-1">
            {Array.from({ length: existingReview.rating }, (_, i) => (
              <span key={i} className="text-yellow-400 text-sm">&#9733;</span>
            ))}
            <span className="ml-1 text-sm font-semibold">{existingReview.rating}점</span>
          </div>
        )}
        {existingReview.comment && (
          <p className="mt-2 text-sm text-card-foreground">{existingReview.comment}</p>
        )}

        {/* 수정 경고 모달 */}
        {showEditWarning && (
          <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-3 dark:border-orange-700 dark:bg-orange-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-orange-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                  수정하면 받은 좋아요가 모두 초기화됩니다.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setShowEditWarning(false);
                      setIsEditing(true);
                    }}
                    className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700"
                  >
                    계속 수정
                  </button>
                  <button
                    onClick={() => setShowEditWarning(false)}
                    className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 */}
        {showDeleteConfirm && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">정말 삭제하시겠습니까?</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                삭제
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('별점을 선택해주세요.');
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      if (hasExisting && isEditing) {
        await api.patch(`/reviews/${existingReview.id}`, {
          rating,
          comment: comment || undefined,
          hasSpoiler,
        });
      } else {
        await api.post('/reviews', {
          contentId,
          rating,
          comment: comment || undefined,
          hasSpoiler,
        });
      }
      setIsEditing(false);
      router.refresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? '한줄평 저장에 실패했습니다.';
      setError(typeof msg === 'string' ? msg : '한줄평 저장에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existingReview) return;
    setIsSubmitting(true);
    try {
      await api.delete(`/reviews/${existingReview.id}`);
      setRating(0);
      setComment('');
      setHasSpoiler(false);
      setShowDeleteConfirm(false);
      router.refresh();
    } catch {
      setError('삭제에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h3 className="mb-3 text-sm font-semibold">
        {isEditing ? '한줄평 수정' : '한줄평 작성'}
      </h3>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">별점</label>
        <StarRating value={rating} onChange={setRating} />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">
          코멘트 (선택)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="작품에 대한 한마디를 남겨보세요."
          maxLength={500}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          id="spoiler-toggle"
          checked={hasSpoiler}
          onChange={(e) => setHasSpoiler(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <label
          htmlFor="spoiler-toggle"
          className="text-sm text-muted-foreground"
        >
          스포일러 포함
        </label>
      </div>

      {error && (
        <p className="mb-3 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting || rating === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? '저장 중...' : isEditing ? '수정 완료' : '등록'}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              if (existingReview) {
                setRating(existingReview.rating ?? 0);
                setComment(existingReview.comment ?? '');
                setHasSpoiler(existingReview.hasSpoiler);
              }
            }}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
