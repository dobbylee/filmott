'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ReviewCard from './ReviewCard';
import type { Review } from '@/types/review';

interface ReviewListClientProps {
  reviews: Review[];
  contentId: number;
}

export default function ReviewListClient({ reviews, contentId }: ReviewListClientProps) {
  const { user } = useAuth();
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) {
      setLikedIds(new Set());
      return;
    }
    api
      .get<number[]>(`/reviews/liked-ids?contentId=${contentId}`)
      .then((res) => setLikedIds(new Set(res.data)))
      .catch(() => setLikedIds(new Set()));
  }, [user, contentId]);

  const filtered = user
    ? reviews.filter((r) => r.userId !== user.id)
    : reviews;

  if (filtered.length === 0) {
    return (
      <div className="flex min-h-[100px] items-center justify-center text-sm text-muted-foreground">
        <p>아직 리뷰가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          initialLiked={likedIds.has(review.id)}
        />
      ))}
    </div>
  );
}
