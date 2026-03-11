import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE, GENRE_MAP } from '@/types/content';
import type { TmdbSearchItem } from '@/types/content';
import { Star } from 'lucide-react';

interface ContentCardProps {
  item: TmdbSearchItem;
}

export default function ContentCard({ item }: ContentCardProps) {
  const title = item.title ?? item.name ?? '제목 없음';
  const releaseDate = item.release_date ?? item.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  const rating = item.vote_average != null ? Number(item.vote_average).toFixed(1) : null;
  const genreNames = (item.genre_ids ?? [])
    .slice(0, 3)
    .map((id) => GENRE_MAP[id])
    .filter(Boolean);

  return (
    <Link
      href={`/contents/${type}/${item.id}`}
      className="group block relative w-full hover:-translate-y-2 transition-all duration-300"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-white/5 border border-white/5 shadow-lg">
        {item.poster_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/40 bg-zinc-900">
            포스터 없음
          </div>
        )}
        
        {/* 오버레이 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />

        {/* 별점 */}
        {rating && Number(rating) > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md px-2 py-1 text-[11px] font-bold text-yellow-500 border border-white/10">
            <Star className="w-3 h-3 fill-current" />
            {rating}
          </div>
        )}

        {/* 타이틀 정보 (호버 시 애니메이션) */}
        <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-1 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          <p className="truncate text-sm sm:text-base font-bold text-white drop-shadow-md">
            {title}
          </p>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-white/60">
              {year && <span>{year}</span>}
              <span>{type === 'tv' ? '시리즈' : '영화'}</span>
            </div>
            {genreNames.length > 0 && (
              <span className="text-[10px] text-white/50 truncate max-w-[60px]">
                {genreNames[0]}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
