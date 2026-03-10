import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchApi } from '@/lib/fetcher';
import ContentGrid from '@/components/content/ContentGrid';
import Pagination from '@/components/content/Pagination';
import SearchTypeFilter from './SearchTypeFilter';
import type { TmdbSearchResult } from '@/types/content';

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    page?: string;
  }>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q ?? '';
  return {
    title: query ? `"${query}" 검색 결과 - filmott` : '검색 - filmott',
  };
}

async function SearchResults({
  query,
  type,
  page,
}: {
  query: string;
  type?: string;
  page: number;
}) {
  if (!query) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
        <p>검색어를 입력해보세요.</p>
      </div>
    );
  }

  const typeParam = type === 'movie' || type === 'tv' ? `&type=${type}` : '';
  const data = await fetchApi<TmdbSearchResult>(
    `/contents/search?q=${encodeURIComponent(query)}&page=${page}${typeParam}`,
    { next: { revalidate: 300 } },
  );

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        총 {data.total_results.toLocaleString()}개의 결과
      </p>
      <ContentGrid
        items={data.results}
        emptyMessage="검색 결과가 없습니다."
      />
      <Pagination currentPage={data.page} totalPages={Math.min(data.total_pages, 500)} />
    </>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q ?? '';
  const type = params.type;
  const page = params.page ? parseInt(params.page, 10) : 1;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-8">
      <h1 className="mb-6 text-2xl font-bold">
        {query ? `"${query}" 검색 결과` : '작품 검색'}
      </h1>

      {query && <SearchTypeFilter currentType={type} />}

      <Suspense
        fallback={
          <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
            <p>검색 중...</p>
          </div>
        }
      >
        <SearchResults query={query} type={type} page={page} />
      </Suspense>
    </div>
  );
}
