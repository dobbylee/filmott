import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, ArrowRight } from 'lucide-react';
import { fetchApi } from '@/lib/fetcher';
import RankingCarousel from '@/components/ranking/RankingCarousel';
import type { RankingItem } from '@/components/ranking/RankingCard';
import type { Review } from '@/types/review';
import type { ContentItem } from '@/types/content';

/* ---- 데이터 fetcher ---- */

async function fetchBoxOffice(): Promise<RankingItem[]> {
  return fetchApi<RankingItem[]>(
    '/rankings?source=kobis&category=daily-box-office&limit=10',
    { cache: 'no-store' },
  );
}

async function fetchTrending(): Promise<RankingItem[]> {
  return fetchApi<RankingItem[]>(
    '/rankings?source=tmdb&category=trending-all-day&limit=20',
    { cache: 'no-store' },
  );
}

async function fetchRecentReviews(): Promise<Review[]> {
  return fetchApi<Review[]>(
    '/reviews/recent?limit=10',
    { cache: 'no-store' },
  );
}

/* ---- 섹션별 서버 컴포넌트 ---- */

async function BoxOfficeSection() {
  try {
    const items = await fetchBoxOffice();
    return <RankingCarousel title="국내 박스오피스 TOP 10" items={items} />;
  } catch {
    return (
      <SectionError title="국내 박스오피스 TOP 10" />
    );
  }
}

async function TrendingSection() {
  try {
    const items = await fetchTrending();
    return <RankingCarousel title="OTT 트렌딩" items={items} />;
  } catch {
    return (
      <SectionError title="OTT 트렌딩" />
    );
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

function RecentReviewItem({ review }: { review: Review }) {
  const content = review.content as ContentItem | undefined;
  const href = content
    ? `/contents/${content.contentType}/${content.tmdbId}`
    : '#';

  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      {/* 포스터 작은 썸네일 */}
      {content?.posterUrl && (
        <Link href={href} className="flex-shrink-0">
          <div className="relative h-[72px] w-[48px] overflow-hidden rounded bg-muted">
            <Image
              src={content.posterUrl}
              alt={content.title}
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
        </Link>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {review.user?.nickname?.charAt(0) ?? '?'}
          </div>
          <span className="text-sm font-medium truncate">
            {review.user?.nickname ?? '익명'}
          </span>
          {review.rating != null && (
            <span className="flex items-center gap-0.5 text-xs">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {review.rating}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
            {formatDate(review.createdAt)}
          </span>
        </div>
        {content && (
          <Link href={href} className="text-xs text-muted-foreground hover:text-primary truncate block mt-0.5">
            {content.title}
          </Link>
        )}
        {review.comment && (
          <p className="mt-1 text-sm leading-relaxed text-card-foreground line-clamp-2">
            {review.hasSpoiler ? '(스포일러 포함)' : review.comment}
          </p>
        )}
      </div>
    </div>
  );
}

async function RecentReviewsSection() {
  try {
    const reviews = await fetchRecentReviews();
    if (reviews.length === 0) {
      return (
        <section>
          <h2 className="mb-3 text-lg font-bold">최근 한줄평</h2>
          <p className="text-sm text-muted-foreground">아직 한줄평이 없습니다.</p>
        </section>
      );
    }
    return (
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">최근 한줄평</h2>
          <Link
            href="/discover"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            더보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="space-y-2">
          {reviews.map((review) => (
            <RecentReviewItem key={review.id} review={review} />
          ))}
        </div>
      </section>
    );
  } catch {
    return <SectionError title="최근 한줄평" />;
  }
}

function SectionError({ title }: { title: string }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">
        데이터를 불러올 수 없습니다.
      </p>
    </section>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[210px] w-[140px] flex-shrink-0 animate-pulse rounded-lg bg-muted sm:h-[240px] sm:w-[160px]"
          />
        ))}
      </div>
    </section>
  );
}

function ReviewSkeleton() {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">최근 한줄평</h2>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[80px] animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </section>
  );
}

/* ---- 메인 페이지 ---- */

export default function HomePage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<SectionSkeleton title="국내 박스오피스 TOP 10" />}>
        <BoxOfficeSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="OTT 트렌딩" />}>
        <TrendingSection />
      </Suspense>

      <Suspense fallback={<ReviewSkeleton />}>
        <RecentReviewsSection />
      </Suspense>
    </div>
  );
}
