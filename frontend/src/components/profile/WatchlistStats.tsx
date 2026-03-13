'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Eye, Bookmark } from 'lucide-react';
import api from '@/lib/api';
import type { WatchlistCounts } from '@/types/watchlist';

interface WatchlistStatsProps {
  userId: number;
}

export default function WatchlistStats({ userId }: WatchlistStatsProps) {
  const [counts, setCounts] = useState<WatchlistCounts | null>(null);

  useEffect(() => {
    if (!userId) return;
    const fetchCounts = async () => {
      try {
        const res = await api.get<WatchlistCounts>('/watchlist/me/counts');
        setCounts(res.data);
      } catch {
        // ignore
      }
    };
    fetchCounts();
  }, [userId]);

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/profile/watchlist?status=watched"
          className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition-colors group"
        >
          <Eye className="h-5 w-5 text-green-400" />
          <span className="text-2xl font-bold text-white group-hover:text-green-400 transition-colors">
            {counts?.watchedCount ?? 0}
          </span>
          <span className="text-xs text-white/50">감상한 작품</span>
        </Link>
        <Link
          href="/profile/watchlist?status=want_to_watch"
          className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 transition-colors group"
        >
          <Bookmark className="h-5 w-5 text-yellow-400" />
          <span className="text-2xl font-bold text-white group-hover:text-yellow-400 transition-colors">
            {counts?.wantToWatchCount ?? 0}
          </span>
          <span className="text-xs text-white/50">감상할 작품</span>
        </Link>
      </div>
    </div>
  );
}
