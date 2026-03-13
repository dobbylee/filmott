'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useComments } from './useComments';
import CommentList from './CommentList';

interface ReviewCommentsProps {
  reviewId: number;
  commentCount?: number;
}

export default function ReviewComments({
  reviewId,
  commentCount = 0,
}: ReviewCommentsProps) {
  const { user, isLoading: authLoading, openAuthModal } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  } = useComments(reviewId);

  // total 초기값을 commentCount로 설정하기 위한 별도 상태
  const [displayTotal, setDisplayTotal] = useState(commentCount);

  useEffect(() => {
    if (total > 0 || comments.length > 0) {
      setDisplayTotal(total);
    }
  }, [total, comments.length]);

  useEffect(() => {
    if (isOpen && comments.length === 0) {
      loadComments(1);
    }
  }, [isOpen, comments.length, loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal('login');
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
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        댓글 {displayTotal > 0 ? displayTotal : ''}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 pl-2 border-l-2 border-border">
          {/* 댓글 작성 */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={authLoading ? '' : user ? '댓글을 입력하세요' : '로그인 후 댓글 작성'}
              disabled={authLoading || !user}
              maxLength={300}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={authLoading || !user || !newComment.trim() || isSubmitting}
              className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              aria-label="댓글 등록"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>

          {/* 에러 메시지 */}
          {errorMessage && (
            <p className="text-xs text-destructive py-1">{errorMessage}</p>
          )}

          {/* 댓글 목록 */}
          <CommentList
            comments={comments}
            currentUserId={user?.id}
            isLoading={isLoading}
            page={page}
            totalPages={totalPages}
            onLoadMore={loadComments}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}
