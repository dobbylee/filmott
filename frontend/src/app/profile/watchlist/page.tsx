'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import TmdbImage, { replaceTmdbSize } from '@/components/common/TmdbImage';
import { Eye, Bookmark, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import YearFilter from '@/components/watchlist/YearFilter';
import MonthSection from '@/components/watchlist/MonthSection';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { WatchlistStatus, WantToWatchResponse, WatchedByYearResponse, WatchedYearsResponse } from '@/types/watchlist';

function WatchlistListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, openAuthModal } = useAuth();

  const statusParam = searchParams.get('status');
  const activeStatus: WatchlistStatus = statusParam === 'want_to_watch' ? 'want_to_watch' : 'watched';
  const yearParam = searchParams.get('year');

  // want_to_watch state
  const [wtwItems, setWtwItems] = useState<WantToWatchResponse['items']>([]);
  const [wtwTotal, setWtwTotal] = useState(0);
  const [wtwHasMore, setWtwHasMore] = useState(false);
  const [wtwLoadingMore, setWtwLoadingMore] = useState(false);

  // watched state
  const [watchedYears, setWatchedYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [watchedData, setWatchedData] = useState<WatchedByYearResponse | null>(null);

  // tab counts (total)
  const [counts, setCounts] = useState<{ watchedCount: number; wantToWatchCount: number } | null>(null);

  // shared state
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      openAuthModal();
      router.replace('/');
    }
  }, [user, authLoading, router, openAuthModal]);

  // Fetch liked IDs for a list of items
  const fetchLikedIds = useCallback(async (items: { review?: { id: number } }[]) => {
    const reviewIds = items
      .filter((item) => item.review?.id)
      .map((item) => item.review!.id);
    if (reviewIds.length > 0) {
      const likedRes = await api.get<number[]>(
        `/reviews/liked-ids?reviewIds=${reviewIds.join(',')}`
      );
      setLikedIds(new Set(likedRes.data));
    } else {
      setLikedIds(new Set());
    }
  }, []);

  // Fetch watched years on mount (when watched tab)
  const fetchWatchedYears = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<WatchedYearsResponse>('/watchlist/me/watched-years');
      setWatchedYears(res.data.years);

      // Determine selected year
      const currentYear = new Date().getFullYear();
      const yearFromParam = yearParam ? parseInt(yearParam, 10) : null;

      if (yearFromParam && res.data.years.includes(yearFromParam)) {
        setSelectedYear(yearFromParam);
      } else if (res.data.years.includes(currentYear)) {
        setSelectedYear(currentYear);
      } else if (res.data.years.length > 0) {
        setSelectedYear(res.data.years[0]);
      } else {
        setSelectedYear(null);
        setIsLoading(false);
      }
    } catch {
      setWatchedYears([]);
      setSelectedYear(null);
      setIsLoading(false);
    }
  }, [user, yearParam]);

  // Fetch watched data for selected year
  const fetchWatchedByYear = useCallback(async () => {
    if (!user || selectedYear === null) return;
    setIsLoading(true);
    try {
      const res = await api.get<WatchedByYearResponse>(
        `/watchlist/me/watched?year=${selectedYear}`
      );
      setWatchedData(res.data);

      // Collect all items across months for liked IDs
      const allItems = res.data.months.flatMap((m) => m.items);
      await fetchLikedIds(allItems);
    } catch {
      setWatchedData(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedYear, fetchLikedIds]);

  // Fetch want_to_watch list (first page)
  const fetchWantToWatch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const res = await api.get<WantToWatchResponse>('/watchlist/me/want-to-watch?limit=30&offset=0');
      setWtwItems(res.data.items);
      setWtwTotal(res.data.total);
      setWtwHasMore(res.data.hasMore);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load more want_to_watch items
  const loadMoreWtw = useCallback(async () => {
    if (!user || wtwLoadingMore) return;
    setWtwLoadingMore(true);
    try {
      const res = await api.get<WantToWatchResponse>(
        `/watchlist/me/want-to-watch?limit=30&offset=${wtwItems.length}`
      );
      setWtwItems((prev) => [...prev, ...res.data.items]);
      setWtwHasMore(res.data.hasMore);
    } catch {
      // ignore
    } finally {
      setWtwLoadingMore(false);
    }
  }, [user, wtwItems.length, wtwLoadingMore]);

  // Fetch total counts on mount
  useEffect(() => {
    if (!user) return;
    api.get<{ watchedCount: number; wantToWatchCount: number }>('/watchlist/me/counts')
      .then((res) => setCounts(res.data))
      .catch(() => {});
  }, [user]);

  // Main effect: fetch data based on active tab
  useEffect(() => {
    if (!user) return;
    if (activeStatus === 'watched') {
      fetchWatchedYears();
    } else {
      fetchWantToWatch();
    }
  }, [user, activeStatus, fetchWatchedYears, fetchWantToWatch]);

  // Fetch watched data when year changes
  useEffect(() => {
    if (activeStatus === 'watched' && selectedYear !== null) {
      fetchWatchedByYear();
    }
  }, [activeStatus, selectedYear, fetchWatchedByYear]);

  const setTab = (status: WatchlistStatus) => {
    if (status === 'watched') {
      router.push('/profile/watchlist?status=watched');
    } else {
      router.push('/profile/watchlist?status=want_to_watch');
    }
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    router.push(`/profile/watchlist?status=watched&year=${year}`);
  };

  if (authLoading || !user) {
    return (
      <div className="mx-auto max-w-2xl px-4">
        <div className="h-10 w-48 rounded bg-white/5 animate-pulse mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12">
      {/* Back link */}
      <Link
        href="/profile"
        className="mb-4 inline-flex items-center gap-1 text-sm text-white/40 hover:text-white transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        프로필로 돌아가기
      </Link>

      {/* Tabs */}
      <div className="mb-6 flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
        <button
          onClick={() => setTab('watched')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeStatus === 'watched'
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <Eye className={`h-4 w-4 ${activeStatus === 'watched' ? 'text-green-400' : ''}`} />
          감상한 작품
          {counts && (
            <span className="text-xs text-white/30">({counts.watchedCount})</span>
          )}
        </button>
        <button
          onClick={() => setTab('want_to_watch')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            activeStatus === 'want_to_watch'
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <Bookmark className={`h-4 w-4 ${activeStatus === 'want_to_watch' ? 'text-yellow-400' : ''}`} />
          감상할 작품
          {counts && (
            <span className="text-xs text-white/30">({counts.wantToWatchCount})</span>
          )}
        </button>
      </div>

      {/* Watched tab content */}
      {activeStatus === 'watched' && (
        <>
          {/* Year filter */}
          {watchedYears.length > 0 && selectedYear !== null && (
            <div className="mb-6 flex items-center gap-3">
              <YearFilter
                years={watchedYears}
                selectedYear={selectedYear}
                onYearChange={handleYearChange}
              />
              {watchedData && (
                <span className="text-sm text-white/30">{watchedData.totalCount}편</span>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : watchedYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Eye className="mb-3 h-10 w-10 text-white/10" />
              <p className="text-sm text-white/40">
                아직 감상한 작품이 없습니다.
              </p>
              <Link
                href="/discover?type=movie"
                className="mt-4 text-sm text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
              >
                작품 둘러보기
              </Link>
            </div>
          ) : watchedData && watchedData.months.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Eye className="mb-3 h-10 w-10 text-white/10" />
              <p className="text-sm text-white/40">
                {selectedYear}년에 감상한 작품이 없습니다.
              </p>
            </div>
          ) : watchedData && (
            <div>
              {watchedData.months.map((monthGroup) => (
                <MonthSection
                  key={monthGroup.month}
                  monthGroup={monthGroup}
                  likedIds={likedIds}
                  onMutate={fetchWatchedByYear}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Want to watch tab content */}
      {activeStatus === 'want_to_watch' && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                <div key={i} className="aspect-[2/3] rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : wtwItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bookmark className="mb-3 h-10 w-10 text-white/10" />
              <p className="text-sm text-white/40">
                아직 감상할 작품이 없습니다.
              </p>
              <Link
                href="/discover?type=movie"
                className="mt-4 text-sm text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
              >
                작품 둘러보기
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {wtwItems.map((item) => {
                  const { content } = item;
                  const href = `/contents/${content.contentType}/${content.tmdbId}`;
                  const posterSrc = content.posterUrl
                    ? (content.posterUrl.startsWith('http') ? replaceTmdbSize(content.posterUrl, 'w342') : `${TMDB_IMAGE_BASE}/w342${content.posterUrl}`)
                    : null;

                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className="group block relative w-full hover:-translate-y-1 transition-transform duration-200"
                    >
                      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-white/5 border border-white/5">
                        {posterSrc ? (
                          <TmdbImage
                            src={posterSrc}
                            alt={content.title}
                            fill
                            sizes="20vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-white/40 bg-zinc-900">
                            포스터 없음
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
              {wtwHasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={loadMoreWtw}
                    disabled={wtwLoadingMore}
                    className="rounded-full border border-white/10 bg-white/5 px-8 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                  >
                    {wtwLoadingMore ? '불러오는 중...' : `더보기 (${wtwTotal - wtwItems.length}개 남음)`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function WatchlistListPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4">
          <div className="h-10 w-48 rounded bg-white/5 animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <WatchlistListContent />
    </Suspense>
  );
}
