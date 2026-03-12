'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, Bookmark, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import YearFilter from '@/components/watchlist/YearFilter';
import MonthSection from '@/components/watchlist/MonthSection';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { WatchlistStatus, WantToWatchResponse, WatchedByYearResponse, WatchedYearsResponse } from '@/types/watchlist';

export default function WatchlistListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, openAuthModal } = useAuth();

  const statusParam = searchParams.get('status');
  const activeStatus: WatchlistStatus = statusParam === 'want_to_watch' ? 'want_to_watch' : 'watched';
  const yearParam = searchParams.get('year');

  // want_to_watch state
  const [wtwData, setWtwData] = useState<WantToWatchResponse | null>(null);

  // watched state
  const [watchedYears, setWatchedYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [watchedData, setWatchedData] = useState<WatchedByYearResponse | null>(null);

  // shared state
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      openAuthModal('login');
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
      }
    } catch {
      setWatchedYears([]);
      setSelectedYear(null);
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

  // Fetch want_to_watch list (all items, no pagination)
  const fetchWantToWatch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const res = await api.get<WantToWatchResponse>('/watchlist/me/want-to-watch');
      setWtwData(res.data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
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

  // Determine watched tab count
  const watchedTabCount = watchedData?.totalCount ?? null;

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
          {activeStatus === 'watched' && watchedTabCount !== null && (
            <span className="text-xs text-white/30">({watchedTabCount})</span>
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
          {wtwData && activeStatus === 'want_to_watch' && (
            <span className="text-xs text-white/30">({wtwData.total})</span>
          )}
        </button>
      </div>

      {/* Watched tab content */}
      {activeStatus === 'watched' && (
        <>
          {/* Year filter */}
          {watchedYears.length > 0 && selectedYear !== null && (
            <YearFilter
              years={watchedYears}
              selectedYear={selectedYear}
              onYearChange={handleYearChange}
            />
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
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : !wtwData || wtwData.items.length === 0 ? (
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
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
              {wtwData.items.map((item) => {
                const { content } = item;
                const href = `/contents/${content.contentType}/${content.tmdbId}`;
                const posterSrc = content.posterUrl
                  ? (content.posterUrl.startsWith('http') ? content.posterUrl : `${TMDB_IMAGE_BASE}/w500${content.posterUrl}`)
                  : null;

                return (
                  <Link
                    key={item.id}
                    href={href}
                    className="group block relative w-full hover:-translate-y-2 transition-all duration-300"
                  >
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-white/5 border border-white/5 shadow-lg">
                      {posterSrc ? (
                        <Image
                          src={posterSrc}
                          alt={content.title}
                          fill
                          sizes="(max-width: 640px) 33vw, 25vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-white/40 bg-zinc-900">
                          포스터 없음
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />
                      <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-1 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                        <p className="truncate text-sm font-bold text-white drop-shadow-md">
                          {content.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs font-medium text-white/60">
                          {content.releaseDate && <span>{content.releaseDate.slice(0, 4)}</span>}
                          <span>{content.contentType === 'tv' ? '시리즈' : '영화'}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
