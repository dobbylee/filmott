import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type { Comment, CommentsResponse } from '@/types/comment';

export function useComments(reviewId: number) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
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
    } catch {
      setErrorMessage('댓글을 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [reviewId]);

  const submitComment = useCallback(async (content: string) => {
    await api.post(`/reviews/${reviewId}/comments`, { content });
    setTotal((prev) => prev + 1);
    await loadComments(1);
  }, [reviewId, loadComments]);

  const deleteComment = useCallback(async (commentId: number) => {
    await api.delete(`/reviews/comments/${commentId}`);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setTotal((prev) => Math.max(0, prev - 1));
  }, []);

  return {
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
  };
}
