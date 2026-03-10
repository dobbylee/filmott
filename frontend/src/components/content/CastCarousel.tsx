'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { CastMember } from '@/types/content';

interface CastCarouselProps {
  cast: CastMember[];
}

export default function CastCarousel({ cast }: CastCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (cast.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 200;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => scroll('left')}
        className="absolute -left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-background p-1.5 shadow-md md:flex"
        aria-label="이전"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {cast.map((member) => (
          <div
            key={member.id}
            className="flex w-[100px] flex-shrink-0 flex-col items-center text-center"
          >
            <div className="relative h-[100px] w-[100px] overflow-hidden rounded-full bg-muted">
              {member.profile_path ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${member.profile_path}`}
                  alt={member.name}
                  fill
                  sizes="100px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  사진 없음
                </div>
              )}
            </div>
            <p className="mt-2 w-full truncate text-xs font-medium">
              {member.name}
            </p>
            <p className="w-full truncate text-[10px] text-muted-foreground">
              {member.character}
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={() => scroll('right')}
        className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-background p-1.5 shadow-md md:flex"
        aria-label="다음"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
