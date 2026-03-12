'use client';

import WatchlistCard from './WatchlistCard';
import type { WatchedMonthGroup } from '@/types/watchlist';

interface MonthSectionProps {
  monthGroup: WatchedMonthGroup;
  likedIds: Set<number>;
  onMutate?: () => void;
}

export default function MonthSection({ monthGroup, likedIds, onMutate }: MonthSectionProps) {
  const { month, count, items } = monthGroup;

  return (
    <section className="mb-8">
      {/* Month header */}
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-2xl font-bold text-white">
          {month}월
        </h3>
        <span className="text-sm text-white/40">
          {count}편
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {items.map((item) => (
          <WatchlistCard
            key={item.id}
            item={item}
            initialLiked={item.review ? likedIds.has(item.review.id) : false}
            onMutate={onMutate}
          />
        ))}
      </div>
    </section>
  );
}
