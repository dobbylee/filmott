'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface LikeButtonProps {
  reviewId: number;
  initialCount: number;
  initialLiked?: boolean;
}

export default function LikeButton({
  reviewId,
  initialCount,
  initialLiked = false,
}: LikeButtonProps) {
  const { user, openAuthModal } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    if (!user) {
      openAuthModal('login');
      return;
    }
    if (isLoading) return;
    setIsLoading(true);

    // 낙관적 업데이트
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!liked);
    setCount(liked ? count - 1 : count + 1);

    try {
      const res = await api.post<{ liked: boolean; likesCount: number }>(
        `/reviews/${reviewId}/like`,
      );
      setLiked(res.data.liked);
      setCount(res.data.likesCount);
    } catch {
      // 롤백
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
      aria-label={liked ? '좋아요 취소' : '좋아요'}
    >
      <Heart
        className={`h-4 w-4 transition-colors ${
          liked ? 'fill-red-500 text-red-500' : ''
        }`}
      />
      <span>{count}</span>
    </button>
  );
}
