import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchApi } from '@/lib/fetcher';
import ContentGrid from '@/components/content/ContentGrid';
import FilterBar from '@/components/content/FilterBar';
import Pagination from '@/components/content/Pagination';
import type { TmdbSearchResult } from '@/types/content';

export const metadata: Metadata = {
  title: '탐색 - filmott',
  description: '장르, OTT, 연도별로 영화와 드라마를 탐색하세요.',
};

interface DiscoverPageProps {
  searchParams: Promise<{
    type?: string;
    genres?: string;
    providers?: string;
    year?: string;
    page?: string;
  }>;
}

async function DiscoverResults({
  type,
  genres,
  providers,
  year,
  page,
}: {
  type: string;
  genres?: string;
  providers?: string;
  year?: string;
  page: number;
}) {
  const params = new URLSearchParams();
  params.set('type', type);
  params.set('page', String(page));
  if (genres) params.set('genres', genres);
  if (providers) params.set('providers', providers);
  if (year) params.set('year', year);

  const data = await fetchApi<TmdbSearchResult>(
    `/contents/discover?${params.toString()}`,
    { next: { revalidate: 300 } },
  );

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        총 {data.total_results.toLocaleString()}개의 작품
      </p>
      <ContentGrid
        items={data.results.map((item) => ({
          ...item,
          media_type: type,
        }))}
        emptyMessage="조건에 맞는 작품이 없습니다."
      />
      <Pagination currentPage={data.page} totalPages={Math.min(data.total_pages, 500)} />
    </>
  );
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const params = await searchParams;
  const type = params.type ?? 'movie';
  const genres = params.genres;
  const providers = params.providers;
  const year = params.year;
  const page = params.page ? parseInt(params.page, 10) : 1;

  const selectedGenres = genres
    ? genres.split(',').map(Number).filter(Boolean)
    : [];
  const selectedProviders = providers
    ? providers.split(',').map(Number).filter(Boolean)
    : [];
  const selectedYear = year ? parseInt(year, 10) : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl px-4">
      <h1 className="mb-6 text-2xl font-bold">작품 탐색</h1>

      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <FilterBar
          type={type}
          selectedGenres={selectedGenres}
          selectedProviders={selectedProviders}
          selectedYear={selectedYear}
        />
      </div>

      <Suspense
        fallback={
          <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
            <p>불러오는 중...</p>
          </div>
        }
      >
        <DiscoverResults
          type={type}
          genres={genres}
          providers={providers}
          year={year}
          page={page}
        />
      </Suspense>
    </div>
  );
}
