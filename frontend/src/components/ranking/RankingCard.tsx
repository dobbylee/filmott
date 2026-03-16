import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE } from '@/types/content';
import { Star } from 'lucide-react';

export interface RankingItem {
  id: number;
  rank: number;
  audienceCount?: number;
  posterUrl?: string;
  content: {
    id: number;
    tmdbId: number;
    contentType: 'movie' | 'tv';
    title: string;
    posterUrl?: string;
    releaseDate?: string;
    voteAverage?: number;
    genres?: { id: number; name: string }[];
  } | null;
  title?: string;
}

interface RankingCardProps {
  item: RankingItem;
}

export default function RankingCard({ item }: RankingCardProps) {
  const content = item.content;
  const title = content?.title ?? item.title ?? '제목 없음';
  const href = content ? `/contents/${content.contentType}/${content.tmdbId}` : '#';
  const posterUrl = content?.posterUrl ?? item.posterUrl;
  const rating = content?.voteAverage != null ? Number(content.voteAverage).toFixed(1) : null;
  const hasPoster = !!posterUrl;

  const className = `group block relative flex-shrink-0 w-[160px] sm:w-[220px] transition-all duration-300 ${
    content ? 'hover:-translate-y-2 cursor-pointer' : hasPoster ? 'cursor-default' : 'opacity-60'
  }`;

  const inner = (
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-white/5 border border-white/5 shadow-lg">
        {posterUrl ? (
          <Image
            src={posterUrl.startsWith('http') ? posterUrl : `${TMDB_IMAGE_BASE}/w342${posterUrl}`}
            alt={title}
            fill
            sizes="(max-width: 640px) 130px, 150px"
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/40 bg-zinc-900">
            데이터 없음
          </div>
        )}
        
        {/* 오버레이 그라디언트 (호버 시 진해짐) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />

        {/* 순위 배지 (네온 스타일) */}
        <div className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-700 to-indigo-600 text-sm font-black text-white shadow-[0_0_15px_rgba(192,38,211,0.5)]">
          {item.rank}
        </div>

        {/* 별점 */}
        {rating && Number(rating) > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md px-2 py-1 text-[11px] font-bold text-yellow-500 border border-white/10">
            <Star className="w-3 h-3 fill-current" />
            {rating}
          </div>
        )}

        {/* 타이틀 정보 (호버 시 애니메이션) */}
        <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-2 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          <p className="truncate text-base font-bold text-white drop-shadow-md">
            {title}
          </p>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-white/60">
              {!content && hasPoster && <span className="text-white/70">상세정보 준비 중</span>}
              {content?.releaseDate && <span>{content.releaseDate.substring(0, 4)}</span>}
              {content && <span>{content.contentType === 'tv' ? '시리즈' : '영화'}</span>}
            </div>
            {item.audienceCount ? (
              <span className="text-sm font-semibold text-white/80">
                {item.audienceCount >= 10000
                  ? `${Math.floor(item.audienceCount / 10000)}만`
                  : item.audienceCount.toLocaleString()}
              </span>
            ) : content?.genres && content.genres.length > 0 ? (
              <span className="text-[10px] text-white/50 truncate max-w-[60px]">
                {content.genres[0].name}
              </span>
            ) : null}
          </div>
        </div>
      </div>
  );

  return content ? (
    <Link href={href} className={className}>{inner}</Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
