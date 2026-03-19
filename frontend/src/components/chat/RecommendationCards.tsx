'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import RecommendationCard from './RecommendationCard';
import type { ChatRecommendationWithPoster } from '@/types/chat';

interface RecommendationCardsProps {
  recommendations: ChatRecommendationWithPoster[];
}

export default function RecommendationCards({ recommendations }: RecommendationCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (recommendations.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -300 : 300,
      behavior: 'smooth',
    });
  };

  return (
    <div className="group/recs relative mt-3 -mx-1">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto px-1 pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {recommendations.map((rec, idx) => (
          <RecommendationCard key={`${rec.contentType}-${rec.tmdbId}-${idx}`} recommendation={rec} />
        ))}
      </div>

      {recommendations.length > 2 && (
        <div className="hidden sm:flex gap-1 absolute -top-8 right-1 opacity-0 group-hover/recs:opacity-100 transition-opacity">
          <button
            onClick={() => scroll('left')}
            aria-label="이전"
            className="rounded-full p-1.5 bg-white/5 border border-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            aria-label="다음"
            className="rounded-full p-1.5 bg-white/5 border border-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
