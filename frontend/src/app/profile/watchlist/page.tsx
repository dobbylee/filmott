'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import WatchlistCard from '@/components/watchlist/WatchlistCard';
import WatchedDateModal from '@/components/watchlist/WatchedDateModal';
import type { WatchlistPage, WatchlistStatus } from '@/types/watchlist';

export default function WatchlistListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, openAuthModal } = useAuth();

  const statusParam = searchParams.get('status');
  const activeStatus: WatchlistStatus = statusParam === 'want_to_watch' ? 'want_to_watch' : 'watched';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  const [data, setData] = useState<WatchlistPage | null>(null);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showDateModal, setShowDateModal] = useState(false);
  const [markWatchedId, setMarkWatchedId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      openAuthModal('login');
      router.replace('/');
    }
  }, [user, authLoading, router, openAuthModal]);

  const fetchWatchlist = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const res = await api.get<WatchlistPage>(
        `/watchlist/me?status=${activeStatus}&page=${currentPage}`
      );
      setData(res.data);

      // Fetch liked status for watched items with reviews
      if (activeStatus === 'watched') {
        const reviewIds = res.data.items
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
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [user, activeStatus, currentPage]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const setTab = (status: WatchlistStatus) => {
    router.push(`/profile/watchlist?status=${status}`);
  };

  const goToPage = (page: number) => {
    router.push(`/profile/watchlist?status=${activeStatus}&page=${page}`);
  };

  const handleMarkWatched = (id: number) => {
    setMarkWatchedId(id);
    setShowDateModal(true);
  };

  const handleDateConfirm = async (date: string) => {
    if (!markWatchedId) return;
    try {
      await api.patch(`/watchlist/${markWatchedId}`, {
        status: 'watched',
        watchedAt: date,
      });
      setShowDateModal(false);
      setMarkWatchedId(null);
      fetchWatchlist();
    } catch {
      // ignore
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await api.delete(`/watchlist/${id}`);
      fetchWatchlist();
    } catch {
      // ignore
    }
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

      <h1 className="mb-6 text-2xl font-bold text-white">워치리스트</h1>

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
          <Eye className="h-4 w-4" />
          감상한 작품
          {data && activeStatus === 'watched' && (
            <span className="text-xs text-white/30">({data.total})</span>
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
          <Bookmark className="h-4 w-4" />
          감상할 작품
          {data && activeStatus === 'want_to_watch' && (
            <span className="text-xs text-white/30">({data.total})</span>
          )}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {activeStatus === 'watched' ? (
            <Eye className="mb-3 h-10 w-10 text-white/10" />
          ) : (
            <Bookmark className="mb-3 h-10 w-10 text-white/10" />
          )}
          <p className="text-sm text-white/40">
            {activeStatus === 'watched'
              ? '아직 감상한 작품이 없습니다.'
              : '아직 감상할 작품이 없습니다.'}
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
          <div className="space-y-3">
            {data.items.map((item) => (
              <WatchlistCard
                key={item.id}
                item={item}
                initialLiked={item.review ? likedIds.has(item.review.id) : false}
                onMarkWatched={activeStatus === 'want_to_watch' ? handleMarkWatched : undefined}
                onRemove={activeStatus === 'want_to_watch' ? handleRemove : undefined}
              />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`h-9 w-9 rounded-lg text-sm font-medium transition-colors ${
                    page === currentPage
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= data.totalPages}
                className="rounded-lg border border-white/10 p-2 text-white/60 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Date modal for mark as watched */}
      {showDateModal && (
        <WatchedDateModal
          onConfirm={handleDateConfirm}
          onCancel={() => {
            setShowDateModal(false);
            setMarkWatchedId(null);
          }}
        />
      )}
    </div>
  );
}
