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

  useEffect(() => {
    if (!user) {
      setExistingReview(null);
      return;
    }

    // 사용자의 기존 한줄평 확인
    api
      .get(`/reviews?contentId=${contentId}&page=1&sort=latest`)
      .then((res) => {
        const reviews: Review[] = res.data.data;
        const mine = reviews.find((r) => r.userId === user.id);
        setExistingReview(mine ?? null);
      })
      .catch(() => {
        setExistingReview(null);
      });
  }, [user, contentId]);

  // 로딩 중
  if (existingReview === undefined) {
    return (
      <div className="h-[120px] animate-pulse rounded-lg bg-muted" />
    );
  }

  return (
    <ReviewForm contentId={contentId} existingReview={existingReview} />
  );
}
