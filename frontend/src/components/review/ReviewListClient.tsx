'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ReviewCard from './ReviewCard';
import ReviewSortSelector from './ReviewSortSelector';
import type { Review, ReviewsResponse } from '@/types/review';

type ReviewSort = 'latest' | 'likes';
const EMPTY_LIKED_IDS = new Set<number>();

interface ReviewListClientProps {
  reviews: Review[];
  contentId: number;
}

interface ReviewListState {
  key: string | null;
  reviews: Review[];
  likedIds: Set<number>;
}

export default function ReviewListClient({ reviews: initialReviews, contentId }: ReviewListClientProps) {
  const { user } = useAuth();
  const [reviewState, setReviewState] = useState<ReviewListState>({
    key: null,
    reviews: initialReviews,
    likedIds: EMPTY_LIKED_IDS,
  });
  const [sort, setSort] = useState<ReviewSort>('latest');
  const shouldFetch = Boolean(user) || sort !== 'latest';
  const requestKey = shouldFetch ? `${user?.id ?? 'guest'}:${contentId}:${sort}` : null;

  useEffect(() => {
    if (!requestKey) {
      return;
    }

    let active = true;

    const loadReviews = async () => {
      try {
        if (!user) {
          const reviewsRes = await api.get<ReviewsResponse>(
            `/reviews?contentId=${contentId}&page=1&sort=${sort}`,
          );
          if (active) {
            setReviewState({
              key: requestKey,
              reviews: reviewsRes.data.data,
              likedIds: EMPTY_LIKED_IDS,
            });
          }
          return;
        }

        const [reviewsRes, likedRes] = await Promise.all([
          api.get<ReviewsResponse>(`/reviews?contentId=${contentId}&page=1&sort=${sort}`),
          api.get<number[]>(`/reviews/liked-ids?contentId=${contentId}`),
        ]);

        if (active) {
          setReviewState({
            key: requestKey,
            reviews: reviewsRes.data.data,
            likedIds: new Set(likedRes.data),
          });
        }
      } catch {
        if (active) {
          setReviewState({
            key: requestKey,
            reviews: initialReviews,
            likedIds: EMPTY_LIKED_IDS,
          });
        }
      }
    };

    void loadReviews();

    return () => {
      active = false;
    };
  }, [contentId, initialReviews, requestKey, sort, user]);

  const handleSortChange = (newSort: ReviewSort) => {
    if (newSort !== sort) {
      setSort(newSort);
    }
  };

  const reviews = requestKey && reviewState.key === requestKey
    ? reviewState.reviews
    : initialReviews;
  const likedIds = requestKey && reviewState.key === requestKey
    ? reviewState.likedIds
    : EMPTY_LIKED_IDS;
  const sortLoading = requestKey !== null && reviewState.key !== requestKey;
  const isAdmin = user?.role === 'ADMIN';
  const filtered = user
    ? reviews.filter((r) => r.userId !== user.id)
    : reviews;

  const handleDeleteReview = (reviewId: number) => {
    setReviewState((prev) => ({
      ...prev,
      reviews: prev.reviews.filter((r) => r.id !== reviewId),
    }));
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
      <div className={`space-y-3 transition-opacity duration-200 ${sortLoading ? 'opacity-50' : 'opacity-100'}`}>
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
    </div>
  );
}
