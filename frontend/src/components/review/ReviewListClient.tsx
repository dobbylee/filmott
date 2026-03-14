'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ReviewCard from './ReviewCard';
import type { Review, ReviewsResponse } from '@/types/review';

interface ReviewListClientProps {
  reviews: Review[];
  contentId: number;
}

export default function ReviewListClient({ reviews: initialReviews, contentId }: ReviewListClientProps) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState(initialReviews);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) {
      setReviews(initialReviews);
      setLikedIds(new Set());
      return;
    }

    // 클라이언트에서 최신 리뷰 + liked 상태를 함께 가져옴
    Promise.all([
      api.get<ReviewsResponse>(`/reviews?contentId=${contentId}&page=1&sort=latest`),
      api.get<number[]>(`/reviews/liked-ids?contentId=${contentId}`),
    ])
      .then(([reviewsRes, likedRes]) => {
        setReviews(reviewsRes.data.data);
        setLikedIds(new Set(likedRes.data));
      })
      .catch(() => {
        setReviews(initialReviews);
        setLikedIds(new Set());
      });
  }, [user, contentId, initialReviews]);

  const isAdmin = user?.role === 'ADMIN';
  const filtered = user
    ? reviews.filter((r) => r.userId !== user.id)
    : reviews;

  const handleDeleteReview = (reviewId: number) => {
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
  };

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
          isAdmin={isAdmin}
          onDelete={() => handleDeleteReview(review.id)}
        />
      ))}
    </div>
  );
}
