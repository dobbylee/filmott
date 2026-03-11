'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Star, Trash2, Send } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Review } from '@/types/review';

interface Comment {
  id: number;
  userId: number;
  content: string;
  createdAt: string;
  user?: {
    id: number;
    nickname: string;
  };
}

interface CommentsResponse {
  data: Comment[];
  total: number;
  page: number;
  totalPages: number;
}

interface ReviewCommentsModalProps {
  review: Review;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReviewCommentsModal({ review, onClose }: ReviewCommentsModalProps) {
  const { user, isLoading: authLoading, openAuthModal } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const loadComments = useCallback(async (p: number) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await api.get<CommentsResponse>(
        `/reviews/${review.id}/comments?page=${p}`,
      );
      if (p === 1) {
        setComments(res.data.data);
      } else {
        setComments((prev) => [...prev, ...res.data.data]);
      }
      setTotal(res.data.total);
      setPage(res.data.page);
      setTotalPages(res.data.totalPages);
    } catch {
      setErrorMessage('댓글을 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [review.id]);

  useEffect(() => {
    loadComments(1);
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal('login');
      return;
    }
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await api.post(`/reviews/${review.id}/comments`, {
        content: newComment.trim(),
      });
      setNewComment('');
      setTotal((prev) => prev + 1);
      await loadComments(1);
    } catch {
      setErrorMessage('댓글 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      await api.delete(`/reviews/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      setErrorMessage('댓글 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">댓글</h2>
          <button
            onClick={onClose}
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
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {review.user?.nickname?.charAt(0) ?? '?'}
              </div>
              <span className="text-sm font-medium">{review.user?.nickname ?? '익명'}</span>
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
            <span className="text-[10px] text-muted-foreground mt-2 block">{formatDate(review.createdAt)}</span>
          </div>

          {/* 댓글 수 */}
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            댓글 {total}개
          </p>

          {/* 댓글 목록 */}
          {isLoading && comments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">불러오는 중...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">아직 댓글이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary flex-shrink-0 mt-0.5">
                    {c.user?.nickname?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{c.user?.nickname ?? '익명'}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                      {user && user.id === c.userId && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="ml-auto p-1.5 sm:p-0 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="댓글 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-card-foreground mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
              {page < totalPages && (
                <button
                  onClick={() => loadComments(page + 1)}
                  disabled={isLoading}
                  className="w-full py-2 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {isLoading ? '불러오는 중...' : '더보기'}
                </button>
              )}
            </div>
          )}
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
              className="rounded-lg bg-primary px-4 py-3 sm:px-3 sm:py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
