import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchApi } from '@/lib/fetcher';
import ContentGrid from '@/components/content/ContentGrid';
import PersonCard from '@/components/content/PersonCard';
import Pagination from '@/components/content/Pagination';
import SearchTypeFilter from './SearchTypeFilter';
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

  const typeParam = type === 'movie' || type === 'tv' || type === 'person'
    ? `&type=${type}` : '';
  const data = await fetchApi<TmdbSearchResult>(
    `/contents/search?q=${encodeURIComponent(query)}&page=${page}${typeParam}`,
    { next: { revalidate: 300 } },
  );

  const personResults: TmdbSearchItem[] = [];
  const contentResults: TmdbSearchItem[] = [];

  if (type === 'person') {
    personResults.push(
      ...data.results.filter((item) => item.media_type === 'person'),
    );
  } else if (type === 'movie' || type === 'tv') {
    contentResults.push(...data.results);
  } else {
    for (const item of data.results) {
      if (item.media_type === 'person') {
        personResults.push(item);
      } else {
        contentResults.push(item);
      }
    }
  }

  const hasResults = personResults.length > 0 || contentResults.length > 0;

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        총 {data.total_results.toLocaleString()}개의 결과
      </p>

      {!hasResults && (
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
          <p>검색 결과가 없습니다.</p>
        </div>
      )}

      {personResults.length > 0 && (
        <section className="mb-8">
          {contentResults.length > 0 && (
            <h2 className="mb-4 text-lg font-bold text-white/90">인물</h2>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {personResults.map((person) => (
              <PersonCard key={`person-${person.id}`} person={person} />
            ))}
          </div>
        </section>
      )}

      {contentResults.length > 0 && (
        <section>
          {personResults.length > 0 && (
            <h2 className="mb-4 text-lg font-bold text-white/90">작품</h2>
          )}
          <ContentGrid
            items={contentResults}
            emptyMessage="검색 결과가 없습니다."
          />
        </section>
      )}

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
