'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Trash2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

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

interface ReviewCommentsProps {
  reviewId: number;
  commentCount?: number;
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

export default function ReviewComments({
  reviewId,
  commentCount = 0,
}: ReviewCommentsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(commentCount);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadComments = useCallback(async (p: number) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await api.get<CommentsResponse>(
        `/reviews/${reviewId}/comments?page=${p}`,
      );
      if (p === 1) {
        setComments(res.data.data);
      } else {
        setComments((prev) => [...prev, ...res.data.data]);
      }
      setTotal(res.data.total);
      setPage(res.data.page);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setErrorMessage('댓글을 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    if (isOpen && comments.length === 0) {
      loadComments(1);
    }
  }, [isOpen, comments.length, loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await api.post(`/reviews/${reviewId}/comments`, {
        content: newComment.trim(),
      });
      setNewComment('');
      setTotal((prev) => prev + 1);
      // 댓글 목록 새로고침
      await loadComments(1);
    } catch (err) {
      console.error('Failed to submit comment:', err);
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
    } catch (err) {
      console.error('Failed to delete comment:', err);
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
        댓글 {total > 0 ? total : ''}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 pl-2 border-l-2 border-border">
          {/* 댓글 작성 */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={user ? '댓글을 입력하세요' : '로그인 후 댓글 작성'}
              disabled={!user}
              maxLength={300}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!user || !newComment.trim() || isSubmitting}
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
          {isLoading && comments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">불러오는 중...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">아직 댓글이 없습니다.</p>
          ) : (
            <>
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2 py-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground flex-shrink-0">
                    {c.user?.nickname?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {c.user?.nickname ?? '익명'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </span>
                      {user && user.id === c.userId && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="댓글 삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-card-foreground mt-0.5">
                      {c.content}
                    </p>
                  </div>
                </div>
              ))}
              {page < totalPages && (
                <button
                  onClick={() => loadComments(page + 1)}
                  disabled={isLoading}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {isLoading ? '불러오는 중...' : '더보기'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
