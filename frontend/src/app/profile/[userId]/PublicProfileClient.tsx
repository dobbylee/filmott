'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, FileText, Eye, Bookmark } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import UserAvatar from '@/components/common/UserAvatar';
import RecentReviewItem from '@/components/review/RecentReviewItem';
import type { PublicProfile } from '@/types/auth';
import type { Review, ReviewsResponse } from '@/types/review';

interface PublicProfileClientProps {
  profile: PublicProfile;
  reviews: ReviewsResponse;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function PublicProfileClient({ profile, reviews }: PublicProfileClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [allReviews, setAllReviews] = useState<Review[]>(reviews.data);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(reviews.total);
  const [totalPages, setTotalPages] = useState(reviews.totalPages);
  const [loading, setLoading] = useState(false);

  // 자기 자신의 프로필이면 /profile로 리다이렉트
  useEffect(() => {
    if (user && user.id === profile.id) {
      router.replace('/profile');
    }
  }, [user, profile.id, router]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoading(true);
    try {
      const res = await api.get<ReviewsResponse>(`/reviews/user/${profile.id}?page=${nextPage}&limit=10`);
      setAllReviews((prev) => [...prev, ...res.data.data]);
      setPage(nextPage);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [page, profile.id]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12">
      {/* 프로필 헤더 */}
      <div className="flex flex-col items-center pt-8 pb-6">
        <UserAvatar
          user={{ nickname: profile.nickname, profileImage: profile.profileImage ?? undefined }}
          size="xl"
        />
        <h1 className="mt-4 text-xl font-bold text-white">{profile.nickname}</h1>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-white/40">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatDate(profile.createdAt)} 가입</span>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <FileText className="h-5 w-5 text-fuchsia-400" />
            <span className="text-2xl font-bold text-white">{profile.reviewCount}</span>
            <span className="text-xs text-white/50">리뷰</span>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <Eye className="h-5 w-5 text-green-400" />
            <span className="text-2xl font-bold text-white">{profile.watchedCount}</span>
            <span className="text-xs text-white/50">감상한 작품</span>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <Bookmark className="h-5 w-5 text-yellow-400" />
            <span className="text-2xl font-bold text-white">{profile.wantToWatchCount}</span>
            <span className="text-xs text-white/50">감상할 작품</span>
          </div>
        </div>
      </div>

      {/* 최근 리뷰 */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">최근 리뷰</h2>
        {allReviews.length === 0 ? (
          <div className="flex min-h-[100px] items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] text-sm text-white/40">
            아직 작성한 리뷰가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {allReviews.map((review) => (
              <RecentReviewItem key={review.id} review={review} />
            ))}
          </div>
        )}
        {page < totalPages && (
          <div className="mt-6 text-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="rounded-full border border-white/10 bg-white/5 px-8 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
            >
              {loading ? '불러오는 중...' : `더보기 (${total - allReviews.length}개 남음)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
