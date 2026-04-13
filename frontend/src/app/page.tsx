import { Suspense } from 'react';
import { fetchApi } from '@/lib/fetcher';
import RankingCarousel from '@/components/ranking/RankingCarousel';
import RecentReviewItem from '@/components/review/RecentReviewItem';
import ChatSection from '@/components/chat/ChatSection';
import type { RankingItem } from '@/components/ranking/RankingCard';
import type { Review } from '@/types/review';
import SectionError from '@/components/common/SectionError';

/* ---- Data Fetchers ---- */

async function fetchBoxOffice(category: 'daily-box-office' | 'weekly-box-office'): Promise<RankingItem[]> {
  return fetchApi<RankingItem[]>(`/rankings?source=kobis&category=${category}&limit=10`, { next: { revalidate: 21600 } });
}

async function fetchTrending(category: 'trending-all-day' | 'trending-all-week'): Promise<RankingItem[]> {
  return fetchApi<RankingItem[]>(`/rankings?source=tmdb&category=${category}&limit=20`, { next: { revalidate: 21600 } });
}

async function fetchRecentReviews(): Promise<Review[]> {
  return fetchApi<Review[]>('/reviews/recent?limit=10', { next: { revalidate: 21600 } });
}

/* ---- Sections ---- */

async function BoxOfficeSection() {
  const boxOffice = await Promise.all([
    fetchBoxOffice('daily-box-office'),
    fetchBoxOffice('weekly-box-office'),
  ])
    .then(([daily, weekly]) => ({ daily, weekly }))
    .catch(() => null);

  if (!boxOffice) {
    return <SectionError title="박스오피스" />;
  }

  return (
    <RankingCarousel
      title="박스오피스"
      tabs={[
        { label: '일간', items: boxOffice.daily },
        { label: '주간', items: boxOffice.weekly },
      ]}
    />
  );
}

async function TrendingSection() {
  const trending = await Promise.all([
    fetchTrending('trending-all-day'),
    fetchTrending('trending-all-week'),
  ])
    .then(([day, week]) => ({ day, week }))
    .catch(() => null);

  if (!trending) {
    return <SectionError title="지금 뜨는 작품" />;
  }

  return (
    <RankingCarousel
      title="지금 뜨는 작품"
      tabs={[
        { label: '일간', items: trending.day },
        { label: '주간', items: trending.week },
      ]}
    />
  );
}


async function RecentReviewsSection() {
  const reviews = await fetchRecentReviews().catch(() => null);

  if (!reviews) {
    return <SectionError title="최근 리뷰" />;
  }

  if (reviews.length === 0) return null;

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">최근 리뷰</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reviews.slice(0, 6).map((review) => (
          <RecentReviewItem key={review.id} review={review} />
        ))}
      </div>
    </section>
  );
}

/* ---- Skeletons ---- */

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="py-8">
      <h2 className="mb-4 text-2xl font-bold tracking-tight text-white/80">{title}</h2>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[280px] w-[180px] flex-shrink-0 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    </section>
  );
}

function ReviewSkeleton() {
  return (
    <section className="py-8">
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-white">최근 리뷰</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[120px] animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    </section>
  );
}

/* ---- Page ---- */

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 space-y-12 pt-8 pb-20">
      <ChatSection />

      <Suspense fallback={<SectionSkeleton title="박스오피스" />}>
        <BoxOfficeSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="지금 뜨는 작품" />}>
        <TrendingSection />
      </Suspense>

      <Suspense fallback={<ReviewSkeleton />}>
        <RecentReviewsSection />
      </Suspense>
    </div>
  );
}
