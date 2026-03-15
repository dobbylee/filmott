'use client';

import { useState, useEffect } from 'react';
import { X, Star, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Review } from '@/types/review';
import { getDisplayNickname } from '@/utils/user';
import { formatCommentDate } from '@/utils/date';
import { useComments } from './useComments';
import CommentList from './CommentList';
import UserAvatar from '@/components/common/UserAvatar';
import { useFocusTrap } from '@/utils/useFocusTrap';

interface ReviewCommentsModalProps {
  review: Review;
  onClose: (commentsCount?: number) => void;
}

export default function ReviewCommentsModal({ review, onClose }: ReviewCommentsModalProps) {
  const { user, isLoading: authLoading, openAuthModal } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useFocusTrap<HTMLDivElement>();

  const {
    comments,
    total,
    page,
    totalPages,
    isLoading,
    errorMessage,
    setErrorMessage,
    loadComments,
    submitComment,
    deleteComment,
  } = useComments(review.id);

  // ESC 키 + body overflow 제어
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(total);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, total]);

  useEffect(() => {
    loadComments(1);
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitComment(newComment.trim());
      setNewComment('');
    } catch {
      setErrorMessage('댓글 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      await deleteComment(commentId);
    } catch {
      setErrorMessage('댓글 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={() => onClose(total)} />
      <div ref={modalRef} className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">댓글</h2>
          <button
            onClick={() => onClose(total)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 리뷰 원문 */}
          <div className="mb-4 rounded-lg bg-white/5 p-4">
            <div className="flex items-center gap-2">
              <UserAvatar user={review.user} size="lg" />
              <span className={`text-sm font-medium ${review.user?.status === 'DELETED' ? 'text-muted-foreground' : ''}`}>{getDisplayNickname(review.user)}</span>
              {review.rating != null && (
                <div className="flex items-center gap-0.5 ml-1">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-semibold">{review.rating}</span>
                </div>
              )}
            </div>
            {review.comment && (
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                {review.comment}
              </p>
            )}
            <span className="text-[10px] text-muted-foreground mt-2 block">{formatCommentDate(review.createdAt)}</span>
          </div>

          {/* 댓글 수 */}
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            댓글 {total}개
          </p>

          {/* 댓글 목록 */}
          <CommentList
            comments={comments}
            currentUserId={user?.id}
            currentUserRole={user?.role}
            isLoading={isLoading}
            page={page}
            totalPages={totalPages}
            onLoadMore={loadComments}
            onDelete={handleDelete}
          />
        </div>

        {/* 에러 메시지 */}
        {errorMessage && (
          <div className="px-5">
            <p className="text-xs text-destructive py-1">{errorMessage}</p>
          </div>
        )}

        {/* 댓글 입력 (하단 고정) */}
        <div className="border-t border-border px-5 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={authLoading ? '' : user ? '댓글을 입력하세요' : '로그인 후 댓글 작성'}
              disabled={authLoading || !user}
              maxLength={300}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={authLoading || !user || !newComment.trim() || isSubmitting}
              className="rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-4 py-3 sm:px-3 sm:py-2 text-white hover:opacity-90 disabled:opacity-50 transition-colors"
              aria-label="댓글 등록"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
