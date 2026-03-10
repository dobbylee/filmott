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

    // 전용 API로 내 리뷰 조회
    api
      .get<Review | null>(`/reviews/my?contentId=${contentId}`)
      .then((res) => {
        setExistingReview(res.data ?? null);
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
