'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ReviewForm from './ReviewForm';
import type { Review } from '@/types/review';

const WATCHLIST_UPDATED_EVENT = 'watchlist-updated';

interface ReviewFormWrapperProps {
  contentId: number;
}

interface ReviewLoadState {
  key: string | null;
  review: Review | null;
  liked: boolean;
}

export default function ReviewFormWrapper({ contentId }: ReviewFormWrapperProps) {
  const { user } = useAuth();
  const [reviewState, setReviewState] = useState<ReviewLoadState>({
    key: null,
    review: null,
    liked: false,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = user ? `${user.id}:${contentId}:${refreshKey}` : null;

  useEffect(() => {
    if (!requestKey) {
      return;
    }

    let active = true;

    const loadReview = async () => {
      try {
        const res = await api.get<Review | null>(`/reviews/my?contentId=${contentId}`);
        const review = res.data && typeof res.data === 'object' ? res.data : null;
        let liked = false;

        if (review) {
          try {
            const likesRes = await api.get<number[]>(`/reviews/liked-ids?contentId=${contentId}`);
            liked = new Set(likesRes.data).has(review.id);
          } catch {
            liked = false;
          }
        }

        if (active) {
          setReviewState({ key: requestKey, review, liked });
        }
      } catch {
        if (active) {
          setReviewState({ key: requestKey, review: null, liked: false });
        }
      }
    };

    void loadReview();

    return () => {
      active = false;
    };
  }, [contentId, requestKey]);

  const handleMutate = () => {
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (!user) return;
    const handleUpdate = () => {
      setRefreshKey((k) => k + 1);
    };

    window.addEventListener(WATCHLIST_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(WATCHLIST_UPDATED_EVENT, handleUpdate);
  }, [user]);

  const existingReview = !user
    ? null
    : reviewState.key === requestKey
      ? reviewState.review
      : undefined;
  const myLiked = user && reviewState.key === requestKey
    ? reviewState.liked
    : false;

  if (existingReview === undefined) {
    return (
      <div className="h-[120px] animate-pulse rounded-lg bg-muted" />
    );
  }

  return (
    <ReviewForm
      contentId={contentId}
      existingReview={existingReview}
      initialLiked={myLiked}
      onMutate={handleMutate}
      refreshKey={refreshKey}
    />
  );
}
