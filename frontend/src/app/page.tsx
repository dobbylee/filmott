import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ArrowRight } from 'lucide-react';
import { fetchApi } from '@/lib/fetcher';
import RankingCarousel from '@/components/ranking/RankingCarousel';
import type { RankingItem } from '@/components/ranking/RankingCard';
import type { Review } from '@/types/review';
import type { ContentItem } from '@/types/content';
import { TMDB_IMAGE_BASE } from '@/types/content';

/* ---- Data Fetchers ---- */

async function fetchBoxOffice(category: 'daily-box-office' | 'weekly-box-office'): Promise<RankingItem[]> {
  return fetchApi<RankingItem[]>(`/rankings?source=kobis&category=${category}&limit=10`, { cache: 'no-store' });
}

async function fetchTrending(category: 'trending-all-day' | 'trending-all-week'): Promise<RankingItem[]> {
  return fetchApi<RankingItem[]>(`/rankings?source=tmdb&category=${category}&limit=20`, { cache: 'no-store' });
}

async function fetchRecentReviews(): Promise<Review[]> {
  return fetchApi<Review[]>('/reviews/recent?limit=10', { cache: 'no-store' });
}

/* ---- Sections ---- */

async function BoxOfficeSection() {
  try {
    const [daily, weekly] = await Promise.all([
      fetchBoxOffice('daily-box-office'),
      fetchBoxOffice('weekly-box-office'),
    ]);
    return (
      <RankingCarousel
        title="박스오피스"
        tabs={[
          { label: '일간', items: daily },
          { label: '주간', items: weekly },
        ]}
      />
    );
  } catch {
    return <SectionError title="박스오피스" />;
  }
}

async function TrendingSection() {
  try {
    const [day, week] = await Promise.all([
      fetchTrending('trending-all-day'),
      fetchTrending('trending-all-week'),
    ]);
    return (
      <RankingCarousel
        title="TMDB 트렌드"
        tabs={[
          { label: '일간', items: day },
          { label: '주간', items: week },
        ]}
      />
    );
  } catch {
    return <SectionError title="TMDB 트렌드" />;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function RecentReviewItem({ review }: { review: Review }) {
  const content = review.content as ContentItem | undefined;
  const href = content ? `/contents/${content.contentType}/${content.tmdbId}` : '#';

  return (
    <div className="group relative flex gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 hover:bg-white/10 transition-colors backdrop-blur-sm">
      {content?.posterUrl && (
        <Link href={href} className="flex-shrink-0 relative h-[100px] w-[66px] overflow-hidden rounded-lg shadow-lg">
          <Image
            src={content.posterUrl.startsWith('http') ? content.posterUrl : `${TMDB_IMAGE_BASE}/w154${content.posterUrl}`}
            alt={content.title}
            fill
            sizes="66px"
            className="object-cover group-hover:scale-110 transition-transform duration-500"
          />
        </Link>
      )}
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-600 to-blue-500 text-[10px] font-bold text-white shadow-sm">
              {review.user?.nickname?.charAt(0) ?? '?'}
            </div>
            <span className="text-sm font-medium text-white/90">
              {review.user?.nickname ?? '익명'}
            </span>
            {review.rating != null && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">
                <Star className="h-3 w-3 fill-current" />
                {review.rating}
              </span>
            )}
          </div>
          <span className="text-xs text-white/40">
            {formatDate(review.createdAt)}
          </span>
        </div>

        {content && (
          <Link href={href} className="text-base font-bold text-white hover:text-fuchsia-400 transition-colors truncate block mb-2">
            {content.title}
          </Link>
        )}

        {review.comment && (
          <p className="text-sm leading-relaxed text-white/70 line-clamp-2">
            {review.hasSpoiler ? <span className="text-red-400/80 italic">스포일러가 포함된 리뷰입니다.</span> : review.comment}
          </p>
        )}
      </div>
    </div>
  );
}

async function RecentReviewsSection() {
  try {
    const reviews = await fetchRecentReviews();
    if (reviews.length === 0) return null;

    return (
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">실시간 생생한 한줄평</h2>
          <Link href="/discover" className="flex items-center gap-1 text-sm font-medium text-white/50 hover:text-white transition-colors">
            더보기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reviews.slice(0, 6).map((review) => (
            <RecentReviewItem key={review.id} review={review} />
          ))}
        </div>
      </section>
    );
  } catch {
    return <SectionError title="최근 한줄평" />;
  }
}

/* ---- Error / Skeletons ---- */

function SectionError({ title }: { title: string }) {
  return (
    <section className="py-8">
      <h2 className="mb-4 text-2xl font-bold tracking-tight text-white/50">{title}</h2>
      <div className="p-8 border border-red-500/20 rounded-2xl bg-red-500/5 text-red-400/80 text-center">
        데이터를 불러올 수 없습니다.
      </div>
    </section>
  );
}

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
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-white/80">실시간 생생한 한줄평</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
    <div className="mx-auto w-full max-w-7xl px-4 space-y-16 pt-8 pb-20">
      <Suspense fallback={<SectionSkeleton title="박스오피스" />}>
        <BoxOfficeSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="TMDB 트렌드" />}>
        <TrendingSection />
      </Suspense>

      <Suspense fallback={<ReviewSkeleton />}>
        <RecentReviewsSection />
      </Suspense>
    </div>
  );
}
