'use client';

import Image from 'next/image';
import Link from 'next/link';
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
    <div className="group/cast">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">출연진</h2>
        <div className="hidden sm:flex gap-2 opacity-0 group-hover/cast:opacity-100 transition-opacity duration-300">
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

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {cast.map((member) => (
          <Link
            key={member.id}
            href={`/person/${member.id}`}
            className="group flex w-[100px] flex-shrink-0 flex-col items-center text-center"
          >
            <div className="relative h-[100px] w-[100px] overflow-hidden rounded-full bg-muted transition-transform duration-200 group-hover:scale-105">
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
            <p className="mt-2 w-full truncate text-xs font-medium group-hover:text-primary group-hover:underline">
              {member.name}
            </p>
            <p className="w-full truncate text-[10px] text-muted-foreground">
              {member.character}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
