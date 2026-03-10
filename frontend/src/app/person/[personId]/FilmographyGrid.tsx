'use client';

import { useState } from 'react';
import ContentGrid from '@/components/content/ContentGrid';
import type { TmdbSearchItem } from '@/types/content';

interface FilmographyGridProps {
  items: TmdbSearchItem[];
}

const PAGE_SIZE = 20;

export default function FilmographyGrid({ items }: FilmographyGridProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <>
      <ContentGrid items={visibleItems} emptyMessage="출연작 정보가 없습니다." />
      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="rounded-full border border-white/10 bg-white/5 px-8 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all"
          >
            더보기 ({items.length - visibleCount}개 남음)
          </button>
        </div>
      )}
    </>
  );
}
