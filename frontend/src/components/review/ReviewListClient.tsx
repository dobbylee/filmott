'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ReviewCard from './ReviewCard';
import ReviewSortSelector from './ReviewSortSelector';
import type { Review, ReviewsResponse } from '@/types/review';

type ReviewSort = 'latest' | 'likes';

interface ReviewListClientProps {
  reviews: Review[];
  contentId: number;
}

export default function ReviewListClient({ reviews: initialReviews, contentId }: ReviewListClientProps) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState(initialReviews);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<ReviewSort>('latest');

  useEffect(() => {
    if (!user) {
      // 비로그인 + 최신순이면 SSR 데이터 그대로 사용
      if (sort === 'latest') {
        setReviews(initialReviews);
      } else {
        api.get<ReviewsResponse>(`/reviews?contentId=${contentId}&page=1&sort=${sort}`)
          .then((res) => setReviews(res.data.data))
          .catch(() => setReviews(initialReviews));
      }
      setLikedIds(new Set());
      return;
    }

    // 클라이언트에서 최신 리뷰 + liked 상태를 함께 가져옴
    Promise.all([
      api.get<ReviewsResponse>(`/reviews?contentId=${contentId}&page=1&sort=${sort}`),
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
  }, [user, contentId, initialReviews, sort]);

  const handleSortChange = (newSort: ReviewSort) => {
    if (newSort !== sort) {
      setSort(newSort);
    }
  };

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
      <div className="flex justify-start">
        <ReviewSortSelector sort={sort} onSortChange={handleSortChange} />
      </div>
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
