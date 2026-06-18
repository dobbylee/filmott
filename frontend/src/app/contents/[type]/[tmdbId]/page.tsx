import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star, Clock, Calendar } from 'lucide-react';
import TmdbImage, { replaceTmdbSize } from '@/components/common/TmdbImage';
import { fetchApi, isApiError } from '@/lib/fetcher';
import CastCarousel from '@/components/content/CastCarousel';
import ReviewListClient from '@/components/review/ReviewListClient';
import ReviewFormWrapper from '@/components/review/ReviewFormWrapper';
import WatchlistStatusButton from '@/components/watchlist/WatchlistStatusButton';
import AdultBlockButton from '@/components/content/AdultBlockButton';
import ContentDetailTracker from '@/components/content/ContentDetailTracker';
import type { ContentDetail, WatchProviderData } from '@/types/content';
import type { ReviewsResponse, ContentStats } from '@/types/review';
import ErrorWithRetry from '@/components/common/ErrorWithRetry';
import WatchProviders from '@/components/content/WatchProviders';
import { serializeJsonLd } from '@/lib/json-ld';

interface ContentDetailPageProps {
  params: Promise<{
    type: string;
    tmdbId: string;
  }>;
}

async function fetchContentDetail(
  type: string,
  tmdbId: string,
): Promise<ContentDetail> {
  return fetchApi<ContentDetail>(
    `/contents/${type}/${tmdbId}`,
    { next: { revalidate: 3600 } },
  );
}

export async function generateMetadata({
  params,
}: ContentDetailPageProps): Promise<Metadata> {
  const { type, tmdbId } = await params;
  try {
    const content = await fetchContentDetail(type, tmdbId);
    const description = content.overview?.slice(0, 160) ?? `${content.title} 상세 정보`;
    const metadata: Metadata = {
      title: content.title,
      description,
      alternates: {
        canonical: `/contents/${type}/${tmdbId}`,
      },
      openGraph: {
        type: 'article',
        title: content.title,
        description,
        images: content.backdropUrl
          ? [{ url: content.backdropUrl, width: 1280, height: 720, alt: content.title }]
          : [],
        url: `/contents/${type}/${tmdbId}`,
      },
      twitter: {
        card: 'summary_large_image',
        title: content.title,
        description,
        images: content.backdropUrl ? [content.backdropUrl] : [],
      },
    };

    if (content.adult) {
      metadata.robots = { index: false, follow: false };
    }

    return metadata;
  } catch {
    return { title: '작품 상세' };
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '미정';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatRuntime(minutes?: number): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

async function ReviewsSection({ contentId }: { contentId: number }) {
  const reviewsSectionData = await Promise.all([
    fetchApi<ReviewsResponse>(
      `/reviews?contentId=${contentId}&page=1&sort=latest`,
      { cache: 'no-store' },
    ),
    fetchApi<ContentStats>(
      `/reviews/${contentId}/stats`,
      { cache: 'no-store' },
    ),
  ])
    .then(([reviewsData, stats]) => ({ reviewsData, stats }))
    .catch(() => null);

  if (!reviewsSectionData) {
    return <ErrorWithRetry title="리뷰" message="리뷰를 불러올 수 없습니다." />;
  }

  const { reviewsData, stats } = reviewsSectionData;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-center gap-4 pl-3">
        <h2 className="text-lg font-bold">리뷰</h2>
        <div className="flex items-center gap-1.5">
          <Star className={`h-5 w-5 ${stats.averageRating != null ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
          <span className="text-lg font-semibold">{stats.averageRating ?? 0}</span>
          <span className="text-sm text-muted-foreground">
            ({stats.reviewCount}개)
          </span>
        </div>
      </div>
      <div className="mb-4">
        <ReviewFormWrapper contentId={contentId} />
      </div>
      <ReviewListClient reviews={reviewsData.data} contentId={contentId} />
    </div>
  );
}

export default async function ContentDetailPage({
  params,
}: ContentDetailPageProps) {
  const { type, tmdbId } = await params;
  let content: ContentDetail;

  try {
    content = await fetchContentDetail(type, tmdbId);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const genres = Array.isArray(content.genres)
    ? content.genres
    : [];

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type === 'tv' ? 'TVSeries' : 'Movie',
    name: content.title,
    description: content.overview ?? undefined,
    image: content.posterUrl
      ? replaceTmdbSize(content.posterUrl, 'w342')
      : undefined,
    datePublished: content.releaseDate ?? undefined,
    genre: genres.length > 0 ? genres.map((g) => g.name) : undefined,
  };

  if (content.director) {
    jsonLd.director = {
      '@type': 'Person',
      name: content.director,
    };
  }

  if (content.voteAverage != null && Number(content.voteAverage) > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(content.voteAverage),
      bestRating: 10,
    };
  }

  return (
    <div className="-mt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ContentDetailTracker tmdbId={tmdbId} title={content.title} contentType={type} />
      {/* 상단: 백드롭 + 포스터 + 기본 정보 */}
      <div className="relative">
        {/* 백드롭 */}
        {content.backdropUrl ? (
          <div className="relative h-[40vh] w-full bg-[#050505] md:h-[70vh] md:max-h-[760px]">
            <div className="relative mx-auto h-full w-full max-w-[1920px] overflow-hidden">
              <TmdbImage
                src={replaceTmdbSize(content.backdropUrl, 'original')}
                alt={content.title}
                fill
                priority
                sizes="(min-width: 1920px) 1920px, 100vw"
                className="object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
            </div>
          </div>
        ) : (
          <div className="h-[200px] w-full bg-gradient-to-b from-white/5 to-transparent md:h-[280px]" />
        )}

        {/* 포스터 + 메타 정보 */}
        <div className="relative mx-auto max-w-7xl px-4">
          <div
            className={`flex gap-6 ${
              content.backdropUrl ? '-mt-32 md:-mt-48' : 'mt-6'
            }`}
          >
            {/* 포스터 */}
            <div className="hidden flex-shrink-0 md:block -mt-8">
              <div className="relative h-[270px] w-[180px] overflow-hidden rounded-lg shadow-xl md:h-[330px] md:w-[220px]">
                {content.posterUrl ? (
                  <TmdbImage
                    src={replaceTmdbSize(content.posterUrl, 'w342')}
                    alt={content.title}
                    fill
                    sizes="220px"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                    포스터 없음
                  </div>
                )}
              </div>
            </div>

            {/* 텍스트 정보 */}
            <div className="relative flex-1 pt-2">
              {/* 모바일 포스터 */}
              <div className="mb-4 md:hidden">
                <div className="relative h-[200px] w-[133px] overflow-hidden rounded-lg shadow-xl">
                  {content.posterUrl ? (
                    <TmdbImage
                      src={replaceTmdbSize(content.posterUrl, 'w342')}
                      alt={content.title}
                      fill
                      sizes="133px"
                      className="object-cover"
                      priority
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      포스터 없음
                    </div>
                  )}
                </div>
              </div>

              <h1 className="text-2xl font-bold md:text-3xl">{content.title}</h1>
              {content.originalTitle && content.originalTitle !== content.title && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {content.originalTitle}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {content.releaseDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(content.releaseDate)}
                  </span>
                )}
                {content.runtime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatRuntime(content.runtime)}
                  </span>
                )}
                {content.voteAverage != null && Number(content.voteAverage) > 0 && (
                  <span className="group relative flex items-center gap-1 cursor-default">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {Number(content.voteAverage).toFixed(1)}
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      TMDB 평점
                    </span>
                  </span>
                )}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {type === 'tv' ? '시리즈' : '영화'}
                </span>
              </div>

              {/* 장르 태그 */}
              {genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <span
                      key={g.id}
                      className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {/* OTT 플랫폼 로고 */}
              {content.watchProviders && (
                <div className="mt-4">
                  <WatchProviders data={content.watchProviders as WatchProviderData} compact />
                </div>
              )}

              {/* 기록하기 버튼 */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <WatchlistStatusButton
                  contentId={content.id}
                  tmdbId={Number(tmdbId)}
                  contentType={type as 'movie' | 'tv'}
                />
                <AdultBlockButton
                  tmdbId={Number(tmdbId)}
                  contentType={type}
                  initialAdult={content.adult ?? false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 중단: 줄거리, 출연진, OTT */}
      <div className="mx-auto max-w-7xl px-4 pt-12 pb-8 space-y-12 md:pt-16 md:space-y-16">
        {/* 줄거리 */}
        {content.overview && (
          <section>
            <h2 className="mb-3 text-lg font-bold">줄거리</h2>
            <p className="leading-relaxed text-muted-foreground">
              {content.overview}
            </p>
          </section>
        )}

        {/* 출연진 */}
        {content.credits.length > 0 && (
          <section>
            <CastCarousel cast={content.credits} />
          </section>
        )}

        {/* 하단: 리뷰 목록 */}
        <section id="reviews" className="scroll-mt-24">
          <Suspense
            fallback={
              <div className="text-sm text-muted-foreground">
                리뷰 불러오는 중...
              </div>
            }
          >
            <ReviewsSection contentId={content.id} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
