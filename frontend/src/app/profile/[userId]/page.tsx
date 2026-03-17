import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchApi } from '@/lib/fetcher';
import type { PublicProfile } from '@/types/auth';
import type { ReviewsResponse } from '@/types/review';
import PublicProfileClient from './PublicProfileClient';

interface PageProps {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { userId } = await params;
  const id = parseInt(userId, 10);
  if (isNaN(id)) return { title: 'filmott' };

  try {
    const profile = await fetchApi<PublicProfile>(`/users/${id}/profile`);
    return {
      title: `${profile.nickname}의 프로필 - filmott`,
      description: `${profile.nickname}의 활동 내역을 확인하세요.`,
    };
  } catch {
    return { title: 'filmott' };
  }
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { userId } = await params;
  const id = parseInt(userId, 10);
  if (isNaN(id)) notFound();

  let profile: PublicProfile;
  try {
    profile = await fetchApi<PublicProfile>(`/users/${id}/profile`);
  } catch {
    notFound();
  }

  let reviews: ReviewsResponse = { data: [], total: 0, page: 1, totalPages: 0 };
  try {
    reviews = await fetchApi<ReviewsResponse>(
      `/reviews/user/${id}?page=1&limit=10`,
      { cache: 'no-store' },
    );
  } catch {
    // 리뷰 조회 실패 시 빈 목록
  }

  return <PublicProfileClient profile={profile} reviews={reviews} />;
}
