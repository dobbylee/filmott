'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ReviewForm from './ReviewForm';
import type { Review } from '@/types/review';

interface ReviewFormWrapperProps {
  contentId: number;
}

export default function ReviewFormWrapper({ contentId }: ReviewFormWrapperProps) {
  const { user } = useAuth();
  const [existingReview, setExistingReview] = useState<Review | null | undefined>(undefined);
  const [myLiked, setMyLiked] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) {
      setExistingReview(null);
      setMyLiked(false);
      return;
    }

    api
      .get<Review | null>(`/reviews/my?contentId=${contentId}`)
      .then((res) => {
        const review = res.data && typeof res.data === 'object' ? res.data : null;
        setExistingReview(review);
        // 내 리뷰가 있으면 liked 여부 확인
        if (review) {
          api
            .get<number[]>(`/reviews/liked-ids?contentId=${contentId}`)
            .then((likesRes) => setMyLiked(new Set(likesRes.data).has(review.id)))
            .catch(() => setMyLiked(false));
        }
      })
      .catch(() => {
        setExistingReview(null);
      });
  }, [user, contentId, refreshKey]);

  const handleMutate = () => {
    setRefreshKey((k) => k + 1);
  };

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
    />
  );
}
