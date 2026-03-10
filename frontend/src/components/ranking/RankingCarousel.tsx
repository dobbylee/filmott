'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import RankingCard from './RankingCard';
import type { RankingItem } from './RankingCard';

interface Tab {
  label: string;
  items: RankingItem[];
}

interface RankingCarouselProps {
  title: string;
  items?: RankingItem[];
  tabs?: Tab[];
}

export default function RankingCarousel({ title, items, tabs }: RankingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -600 : 600,
      behavior: 'smooth',
    });
  };

  const currentItems = tabs ? tabs[activeTab].items : (items ?? []);
  if (currentItems.length === 0 && !tabs) return null;

  return (
    <section className="relative group/carousel">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>

          {tabs && (
            <div className="flex rounded-full bg-white/5 border border-white/10 p-0.5">
              {tabs.map((tab, i) => (
                <button
                  key={tab.label}
                  onClick={() => {
                    setActiveTab(i);
                    scrollRef.current?.scrollTo({ left: 0 });
                  }}
                  className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full transition-all duration-200 ${
                    activeTab === i
                      ? 'bg-white/15 text-white'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

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

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-6 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {currentItems.map((item) => (
            <div key={item.id} className="snap-start">
              <RankingCard item={item} />
            </div>
          ))}
        </div>

        <div className="absolute top-0 bottom-6 right-0 w-24 bg-gradient-to-l from-[#050505] to-transparent pointer-events-none hidden sm:block z-10" />
      </div>
    </section>
  );
}
