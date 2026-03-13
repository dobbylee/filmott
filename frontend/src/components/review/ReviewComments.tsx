'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Trash2, Send } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { getDisplayNickname, isDeletedUser } from '@/utils/user';

interface Comment {
  id: number;
  userId: number;
  content: string;
  createdAt: string;
  user?: {
    id: number;
    nickname: string;
    status?: string;
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
  const { user, isLoading: authLoading, openAuthModal } = useAuth();
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
      openAuthModal('login');
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
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          {/* 댓글 작성 */}
          <form onSubmit={handleSubmit} className="flex gap-2 items-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-700 to-indigo-600 text-white text-xs font-medium flex-shrink-0">
              {user?.nickname?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={authLoading ? '' : user ? '댓글을 입력하세요' : '로그인 후 댓글 작성'}
              disabled={authLoading || !user}
              maxLength={300}
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 placeholder:text-white/30"
            />
            <button
              type="submit"
              disabled={authLoading || !user || !newComment.trim() || isSubmitting}
              className="flex items-center rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-3 py-2 text-xs font-medium text-white hover:opacity-80 disabled:opacity-50 transition-all"
              aria-label="댓글 등록"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>

          {/* 에러 메시지 */}
          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}

          {/* 댓글 목록 */}
          {isLoading && comments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">불러오는 중...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">아직 댓글이 없습니다.</p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-3 px-2 py-3 hover:bg-white/[0.03] transition-colors">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium flex-shrink-0 ${isDeletedUser(c.user) ? 'bg-muted text-muted-foreground' : 'bg-gradient-to-tr from-fuchsia-700 to-indigo-600 text-white'}`}>
                    {isDeletedUser(c.user) ? '?' : (c.user?.nickname?.charAt(0) ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isDeletedUser(c.user) ? 'text-muted-foreground' : ''}`}>
                        {getDisplayNickname(c.user)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </span>
                      {user && user.id === c.userId && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="댓글 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-white/70 mt-1 leading-relaxed">
                      {c.content}
                    </p>
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
      )}
    </div>
  );
}
