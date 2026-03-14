'use client';

import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface LikeButtonProps {
  reviewId: number;
  initialCount: number;
  initialLiked?: boolean;
  size?: 'sm' | 'md';
  onChange?: (liked: boolean, count: number) => void;
}

export default function LikeButton({
  reviewId,
  initialCount,
  initialLiked = false,
  size = 'sm',
  onChange,
}: LikeButtonProps) {
  const { user, openAuthModal } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked]);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const handleToggle = async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (isLoading) return;
    setIsLoading(true);

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
      onChange?.(res.data.liked, res.data.likesCount);
    } catch {
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setIsLoading(false);
    }
  };

  const isMd = size === 'md';

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`flex items-center gap-1 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50 ${
        isMd ? 'text-sm' : 'text-xs'
      }`}
      aria-label={liked ? '좋아요 취소' : '좋아요'}
    >
      <Heart
        className={`transition-colors ${isMd ? 'h-5 w-5' : 'h-4 w-4'} ${
          liked ? 'fill-red-500 text-red-500' : ''
        }`}
      />
      <span>{count}</span>
    </button>
  );
}
