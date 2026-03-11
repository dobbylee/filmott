import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchApi } from '@/lib/fetcher';
import Pagination from '@/components/content/Pagination';
import ContentGrid from '@/components/content/ContentGrid';
import SearchTypeFilter from './SearchTypeFilter';
import SearchResultSections from './SearchResultSections';
import type { TmdbSearchResult, TmdbSearchItem } from '@/types/content';

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

/* 영화/시리즈 탭: 페이지네이션 */
async function PaginatedResults({
  query,
  type,
  page,
}: {
  query: string;
  type: string;
  page: number;
}) {
  const data = await fetchApi<TmdbSearchResult>(
    `/contents/search?q=${encodeURIComponent(query)}&type=${type}&page=${page}`,
    { next: { revalidate: 300 } },
  );

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        총 {data.total_results.toLocaleString()}개의 결과
      </p>
      <ContentGrid items={data.results} emptyMessage="검색 결과가 없습니다." />
      <Pagination currentPage={data.page} totalPages={Math.min(data.total_pages, 500)} />
    </>
  );
}

/* 전체/인물 탭: 더보기 패턴 */
async function LoadMoreResults({
  query,
  type,
}: {
  query: string;
  type?: string;
}) {
  const data = await fetchApi<TmdbSearchResult>(
    `/contents/search?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ''}&page=1`,
    { next: { revalidate: 300 } },
  );

  const personResults: TmdbSearchItem[] = [];
  const contentResults: TmdbSearchItem[] = [];

  for (const item of data.results) {
    if (item.media_type === 'person') {
      personResults.push(item);
    } else {
      contentResults.push(item);
    }
  }

  const personTotal = data.personTotal ?? (type === 'person' ? data.total_results : personResults.length);
  const contentTotal = data.contentTotal ?? contentResults.length;

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        총 {data.total_results.toLocaleString()}개의 결과
      </p>
      <SearchResultSections
        key={`${query}-${type ?? 'all'}`}
        query={query}
        searchType={type}
        personResults={personResults}
        contentResults={contentResults}
        personTotal={personTotal}
        contentTotal={contentTotal}
      />
    </>
  );
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

  // 영화/시리즈: 페이지네이션
  if (type === 'movie' || type === 'tv') {
    return <PaginatedResults query={query} type={type} page={page} />;
  }

  // 전체/인물: 더보기
  return <LoadMoreResults query={query} type={type === 'person' ? 'person' : undefined} />;
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
