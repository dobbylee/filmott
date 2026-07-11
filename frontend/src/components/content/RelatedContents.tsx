'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import TmdbImage, { replaceTmdbSize } from '@/components/common/TmdbImage';
import { useAuth } from '@/contexts/AuthContext';
import { trackEvent } from '@/lib/ga';
import type { RelatedContent } from '@/types/content';

interface RelatedContentsProps {
  items: RelatedContent[];
  currentContentType: string;
  currentTmdbId: string;
}

export default function RelatedContents({
  items,
  currentContentType,
  currentTmdbId,
}: RelatedContentsProps) {
  const { user } = useAuth();
  const visibleItems = items.slice(0, 6);

  if (visibleItems.length === 0) return null;

  const trackRelatedClick = () => {
    trackEvent('detail_action_clicked', {
      action: 'related_content',
      content_type: currentContentType,
      tmdb_id: currentTmdbId,
      authenticated: user ? 1 : 0,
    });
  };

  return (
    <section aria-labelledby="related-contents-heading">
      <h2 id="related-contents-heading" className="mb-4 text-lg font-bold">
        이 작품과 비슷한 작품
      </h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-6">
        {visibleItems.map((item) => {
          const year = item.releaseDate?.slice(0, 4);
          const rating =
            item.voteAverage != null && Number(item.voteAverage) > 0
              ? Number(item.voteAverage).toFixed(1)
              : null;

          return (
            <Link
              key={`${item.contentType}:${item.tmdbId}`}
              href={`/contents/${item.contentType}/${item.tmdbId}`}
              onClick={trackRelatedClick}
              className="group w-36 shrink-0 md:w-auto"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {item.posterUrl ? (
                  <TmdbImage
                    src={replaceTmdbSize(item.posterUrl, 'w342')}
                    alt={item.title}
                    fill
                    sizes="(max-width: 767px) 144px, (max-width: 1023px) 33vw, 16vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-white/40">
                    포스터 없음
                  </div>
                )}
                {rating && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-yellow-400">
                    <Star className="h-3 w-3 fill-current" />
                    {rating}
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-sm font-semibold text-white transition-colors group-hover:text-fuchsia-300">
                {item.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[year, item.contentType === 'tv' ? '시리즈' : '영화']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
