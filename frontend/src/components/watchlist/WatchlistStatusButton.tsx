'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Bookmark, ChevronDown, Trash2, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import ReviewFormModal from '@/components/review/ReviewFormModal';
import { trackEvent } from '@/lib/ga';
import type { WatchlistStatus, WatchlistStatusResponse } from '@/types/watchlist';
import type { Review } from '@/types/review';

const WATCHLIST_UPDATED_EVENT = 'watchlist-updated';

interface WatchlistStatusButtonProps {
  contentId: number;
  tmdbId: number;
  contentType: 'movie' | 'tv';
}

function isReview(value: unknown): value is Review {
  if (typeof value !== 'object' || value === null) return false;
  const review = value as Partial<Review>;
  return typeof review.id === 'number' && typeof review.contentId === 'number';
}

export default function WatchlistStatusButton({ contentId, tmdbId, contentType }: WatchlistStatusButtonProps) {
  const { user, openAuthModal } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<WatchlistStatus | null>(null);
  const [watchlistId, setWatchlistId] = useState<number | null>(null);
  const [watchedAt, setWatchedAt] = useState<string | null>(null);
  const [reviewForModal, setReviewForModal] = useState<Review | null>(null);
  const [showRemoveReviewConfirm, setShowRemoveReviewConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch current status
  useEffect(() => {
    if (!user) {
      setStatus(null);
      setWatchlistId(null);
      return;
    }

    const fetchStatus = async () => {
      try {
        const res = await api.get<WatchlistStatusResponse>(
          `/watchlist/me/status?tmdbId=${tmdbId}&contentType=${contentType}`
        );
        setStatus(res.data.status);
        setWatchlistId(res.data.watchlistId);
        setWatchedAt(res.data.watchedAt ?? null);
      } catch {
        // ignore
      }
    };

    fetchStatus();
  }, [user, tmdbId, contentType]);

  // Listen for watchlist-updated events (e.g. from ReviewFormModal)
  useEffect(() => {
    const handleUpdate = () => {
      if (!user) return;
      api.get<WatchlistStatusResponse>(
        `/watchlist/me/status?tmdbId=${tmdbId}&contentType=${contentType}`
      ).then((res) => {
        setStatus(res.data.status);
        setWatchlistId(res.data.watchlistId);
        setWatchedAt(res.data.watchedAt ?? null);
      }).catch(() => {});
    };
    window.addEventListener(WATCHLIST_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(WATCHLIST_UPDATED_EVENT, handleUpdate);
  }, [user, tmdbId, contentType]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showDropdown]);

  const handleButtonClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    setShowDropdown(!showDropdown);
  };

  const fetchMyReview = async (): Promise<Review | null> => {
    try {
      const res = await api.get<unknown>(`/reviews/my?contentId=${contentId}`);
      return isReview(res.data) ? res.data : null;
    } catch {
      return null;
    }
  };

  const saveToWatchlist = async (newStatus: WatchlistStatus, watchedAt?: string) => {
    const res = await api.post('/watchlist', {
      tmdbId,
      contentType,
      status: newStatus,
      ...(watchedAt ? { watchedAt } : {}),
    });
    trackEvent('watchlist_added', { status: newStatus, content_type: contentType });
    setStatus(newStatus);
    setWatchlistId(res.data.id);
    setWatchedAt(res.data.watchedAt ?? null);
    window.dispatchEvent(new Event(WATCHLIST_UPDATED_EVENT));
    router.refresh();
  };

  const addToWatchlist = async (newStatus: WatchlistStatus, watchedAt?: string) => {
    setIsLoading(true);
    try {
      await saveToWatchlist(newStatus, watchedAt);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setShowDropdown(false);
    }
  };

  const deleteWatchlist = async () => {
    if (!watchlistId) return;
    await api.delete(`/watchlist/${watchlistId}`);
    setStatus(null);
    setWatchlistId(null);
    setWatchedAt(null);
    window.dispatchEvent(new Event(WATCHLIST_UPDATED_EVENT));
    router.refresh();
  };

  const removeFromWatchlist = async () => {
    setIsLoading(true);
    try {
      await deleteWatchlist();
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setShowDropdown(false);
    }
  };

  const handleWantToWatch = async () => {
    await addToWatchlist('want_to_watch');
  };

  const requestRemoveFromWatchlist = async () => {
    if (!watchlistId) return;
    setShowDropdown(false);
    setIsLoading(true);
    const review = await fetchMyReview();
    setIsLoading(false);

    if (review) {
      setConfirmError('');
      setShowRemoveReviewConfirm(true);
      return;
    }

    await removeFromWatchlist();
  };

  const handleConfirmReviewRemoval = async () => {
    if (!showRemoveReviewConfirm) return;
    setIsLoading(true);
    setConfirmError('');

    try {
      await deleteWatchlist();
      setShowRemoveReviewConfirm(false);
    } catch {
      setConfirmError('처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const closeReviewRemovalConfirm = () => {
    if (isLoading) return;
    setShowRemoveReviewConfirm(false);
    setConfirmError('');
  };

  const handleWatchedClick = async () => {
    setShowDropdown(false);
    setIsLoading(true);
    try {
      const res = await api.get<unknown>(`/reviews/my?contentId=${contentId}`);
      setReviewForModal(isReview(res.data) ? res.data : null);
    } catch {
      setReviewForModal(null);
    } finally {
      setIsLoading(false);
      setShowReviewModal(true);
    }
  };

  // Button appearance by status
  const getButtonContent = () => {
    if (isLoading) {
      return (
        <span className="flex items-center gap-2 text-sm text-white/60">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        </span>
      );
    }

    if (!status) {
      return (
        <>
          <Plus className="h-4 w-4" />
          <span>기록하기</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/50" />
        </>
      );
    }

    if (status === 'want_to_watch') {
      return (
        <>
          <Bookmark className="h-4 w-4 text-yellow-400" />
          <span>감상할 작품</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/50" />
        </>
      );
    }

    return (
      <>
        <Eye className="h-4 w-4 text-green-400" />
        <span>감상한 작품</span>
        <ChevronDown className="h-3.5 w-3.5 text-white/50" />
      </>
    );
  };

  const getButtonStyle = () => {
    if (!status) {
      return 'border-white/10 bg-white/5 text-white hover:bg-white/10';
    }
    if (status === 'want_to_watch') {
      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20';
    }
    return 'border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20';
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={handleButtonClick}
        disabled={isLoading}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${getButtonStyle()}`}
      >
        {getButtonContent()}
      </button>

      {showDropdown && (
        <div className="absolute left-0 top-full z-10 mt-2 min-w-full rounded-xl border border-white/10 bg-[#111] py-1 shadow-2xl overflow-hidden whitespace-nowrap">
          {!status && (
            <>
              <button
                onClick={handleWantToWatch}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Bookmark className="h-4 w-4 text-yellow-400" />
                감상할 작품
              </button>
              <button
                onClick={handleWatchedClick}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Eye className="h-4 w-4 text-green-400" />
                감상한 작품
              </button>
            </>
          )}

          {status === 'want_to_watch' && (
            <>
              <button
                onClick={handleWatchedClick}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Check className="h-4 w-4 text-green-400" />
                감상한 작품
              </button>
              <button
                onClick={requestRemoveFromWatchlist}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                제거
              </button>
            </>
          )}

          {status === 'watched' && (
            <button
              onClick={requestRemoveFromWatchlist}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              제거
            </button>
          )}
        </div>
      )}

      {showReviewModal && (
        <ReviewFormModal
          contentId={contentId}
          existingReview={reviewForModal}
          initialWatchedAt={watchedAt}
          forceWatchedAtInput
          onClose={() => {
            setShowReviewModal(false);
            setReviewForModal(null);
          }}
        />
      )}

      {showRemoveReviewConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={closeReviewRemovalConfirm} />
          <div className="relative w-full max-w-xs rounded-xl border border-red-500/30 bg-card p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-500/10 p-2 text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">리뷰도 함께 삭제돼요</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  감상한 작품 기록을 삭제하면<br />
                  리뷰와 댓글도 함께 삭제됩니다.
                </p>
                {confirmError && (
                  <p className="mt-3 text-sm text-destructive">{confirmError}</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeReviewRemovalConfirm}
                disabled={isLoading}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmReviewRemoval}
                disabled={isLoading}
                className="rounded-lg border border-red-500/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {isLoading
                  ? '처리 중...'
                  : '제거'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
