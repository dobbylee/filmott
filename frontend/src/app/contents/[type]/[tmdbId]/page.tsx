import { Suspense } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Star, Clock, Calendar } from 'lucide-react';
import { fetchApi } from '@/lib/fetcher';
import CastCarousel from '@/components/content/CastCarousel';
import WatchProviders from '@/components/content/WatchProviders';
import ReviewList from '@/components/review/ReviewList';
import ReviewFormWrapper from '@/components/review/ReviewFormWrapper';
import type { ContentDetail } from '@/types/content';
import type { ReviewsResponse, ContentStats } from '@/types/review';

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
    { next: { revalidate: 600 } },
  );
}

export async function generateMetadata({
  params,
}: ContentDetailPageProps): Promise<Metadata> {
  const { type, tmdbId } = await params;
  try {
    const content = await fetchContentDetail(type, tmdbId);
    return {
      title: `${content.title} - filmott`,
      description: content.overview?.slice(0, 160) ?? `${content.title} 상세 정보`,
      openGraph: {
        title: content.title,
        description: content.overview ?? '',
        images: content.backdropUrl ? [content.backdropUrl] : [],
      },
    };
  } catch {
    return { title: '작품 상세 - filmott' };
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
  try {
    const [reviewsData, stats] = await Promise.all([
      fetchApi<ReviewsResponse>(
        `/reviews?contentId=${contentId}&page=1&sort=latest`,
        { next: { revalidate: 60 } },
      ),
      fetchApi<ContentStats>(
        `/reviews/${contentId}/stats`,
        { next: { revalidate: 60 } },
      ),
    ]);

    return (
      <div>
        <div className="mb-4 flex items-center gap-4">
          <h2 className="text-lg font-bold">한줄평</h2>
          {stats.averageRating != null && (
            <div className="flex items-center gap-1.5">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="text-lg font-semibold">{stats.averageRating}</span>
              <span className="text-sm text-muted-foreground">
                ({stats.reviewCount}개)
              </span>
            </div>
          )}
        </div>
        <div className="mb-4">
          <ReviewFormWrapper contentId={contentId} />
        </div>
        <ReviewList reviews={reviewsData.data} />
      </div>
    );
  } catch {
    return (
      <div>
        <h2 className="mb-4 text-lg font-bold">한줄평</h2>
        <p className="text-sm text-muted-foreground">
          한줄평을 불러올 수 없습니다.
        </p>
      </div>
    );
  }
}

export default async function ContentDetailPage({
  params,
}: ContentDetailPageProps) {
  const { type, tmdbId } = await params;

  let content: ContentDetail;
  try {
    content = await fetchContentDetail(type, tmdbId);
  } catch {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">작품 정보를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const genres = Array.isArray(content.genres)
    ? content.genres
    : [];

  return (
    <div className="-mx-4 -mt-6">
      {/* 상단: 백드롭 + 포스터 + 기본 정보 */}
      <div className="relative">
        {/* 백드롭 */}
        {content.backdropUrl && (
          <div className="relative h-[300px] w-full md:h-[400px]">
            <Image
              src={content.backdropUrl}
              alt={content.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
        )}

        {/* 포스터 + 메타 정보 */}
        <div className="relative mx-auto max-w-7xl px-4">
          <div
            className={`flex gap-6 ${
              content.backdropUrl ? '-mt-32 md:-mt-48' : 'mt-6'
            }`}
          >
            {/* 포스터 */}
            <div className="hidden flex-shrink-0 md:block">
              <div className="relative h-[270px] w-[180px] overflow-hidden rounded-lg shadow-xl md:h-[330px] md:w-[220px]">
                {content.posterUrl ? (
                  <Image
                    src={content.posterUrl}
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
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {Number(content.voteAverage).toFixed(1)}
                  </span>
                )}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {type === 'tv' ? 'TV' : '영화'}
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
            </div>
          </div>
        </div>
      </div>

      {/* 중단: 줄거리, 출연진, OTT */}
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
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
            <h2 className="mb-3 text-lg font-bold">출연진</h2>
            <CastCarousel cast={content.credits} />
          </section>
        )}

        {/* OTT 제공 정보 */}
        {content.watchProviders && (
          <section>
            <h2 className="mb-3 text-lg font-bold">시청 가능한 곳</h2>
            <WatchProviders data={content.watchProviders} />
          </section>
        )}

        {/* 하단: 한줄평 목록 */}
        <section>
          <Suspense
            fallback={
              <div className="text-sm text-muted-foreground">
                한줄평 불러오는 중...
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
