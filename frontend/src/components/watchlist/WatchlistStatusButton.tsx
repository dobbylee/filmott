'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Eye, Bookmark, ChevronDown, Trash2, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import WatchedDateModal from './WatchedDateModal';
import type { WatchlistStatus, WatchlistStatusResponse } from '@/types/watchlist';

interface WatchlistStatusButtonProps {
  tmdbId: number;
  contentType: 'movie' | 'tv';
}

export default function WatchlistStatusButton({ tmdbId, contentType }: WatchlistStatusButtonProps) {
  const { user, openAuthModal } = useAuth();
  const [status, setStatus] = useState<WatchlistStatus | null>(null);
  const [watchlistId, setWatchlistId] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
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
      } catch {
        // ignore
      }
    };

    fetchStatus();
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
      openAuthModal('login');
      return;
    }
    setShowDropdown(!showDropdown);
  };

  const addToWatchlist = async (newStatus: WatchlistStatus, watchedAt?: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/watchlist', {
        tmdbId,
        contentType,
        status: newStatus,
        ...(watchedAt ? { watchedAt } : {}),
      });
      setStatus(newStatus);
      setWatchlistId(res.data.id);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setShowDropdown(false);
      setShowDateModal(false);
    }
  };

  const updateToWatched = async (watchedAt: string) => {
    if (!watchlistId) return;
    setIsLoading(true);
    try {
      await api.patch(`/watchlist/${watchlistId}`, {
        status: 'watched',
        watchedAt,
      });
      setStatus('watched');
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setShowDateModal(false);
    }
  };

  const removeFromWatchlist = async () => {
    if (!watchlistId) return;
    setIsLoading(true);
    try {
      await api.delete(`/watchlist/${watchlistId}`);
      setStatus(null);
      setWatchlistId(null);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setShowDropdown(false);
    }
  };

  const handleWantToWatch = () => addToWatchlist('want_to_watch');

  const handleWatchedClick = () => {
    setShowDropdown(false);
    if (status === 'want_to_watch') {
      // Switching from want_to_watch to watched
      setShowDateModal(true);
    } else {
      // Adding as watched directly
      setShowDateModal(true);
    }
  };

  const handleDateConfirm = (date: string) => {
    if (status === 'want_to_watch' && watchlistId) {
      updateToWatched(date);
    } else {
      addToWatchlist('watched', date);
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
                onClick={removeFromWatchlist}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                제거
              </button>
            </>
          )}

          {status === 'watched' && (
            <button
              onClick={removeFromWatchlist}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              제거
            </button>
          )}
        </div>
      )}

      {showDateModal && (
        <WatchedDateModal
          onConfirm={handleDateConfirm}
          onCancel={() => setShowDateModal(false)}
        />
      )}
    </div>
  );
}
