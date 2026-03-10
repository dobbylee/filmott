'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import RankingCard from './RankingCard';
import type { RankingItem } from './RankingCard';

interface RankingCarouselProps {
  title: string;
  items: RankingItem[];
}

export default function RankingCarousel({ title, items }: RankingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 600; // Increased scroll amount for larger cards
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (items.length === 0) return null;

  return (
    <section className="relative group/carousel">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        
        {/* 데스크톱용 외부 화살표 네비게이션 */}
        <div className="hidden sm:flex gap-2 opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300">
          <button
            onClick={() => scroll('left')}
            aria-label="이전"
            className="rounded-full p-2 bg-white/5 border border-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all backdrop-blur-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            aria-label="다음"
            className="rounded-full p-2 bg-white/5 border border-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all backdrop-blur-sm"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      {/* 캐러셀 컨테이너 */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-6 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <div key={item.id} className="snap-start">
              <RankingCard item={item} />
            </div>
          ))}
        </div>
        
        {/* 양끝 그라디언트 마스크 (옵션) */}
        <div className="absolute top-0 bottom-6 right-0 w-24 bg-gradient-to-l from-[#050505] to-transparent pointer-events-none hidden sm:block z-10" />
      </div>
    </section>
  );
}
