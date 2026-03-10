import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE } from '@/types/content';

export interface RankingItem {
  id: number;
  rank: number;
  content: {
    id: number;
    tmdbId: number;
    contentType: 'movie' | 'tv';
    title: string;
    posterUrl?: string;
    releaseDate?: string;
    voteAverage?: number;
  } | null;
  title?: string;
}

interface RankingCardProps {
  item: RankingItem;
}

export default function RankingCard({ item }: RankingCardProps) {
  const content = item.content;
  const title = content?.title ?? item.title ?? '제목 없음';
  const href = content
    ? `/contents/${content.contentType}/${content.tmdbId}`
    : '#';
  const posterUrl = content?.posterUrl;
  const rating = content?.voteAverage != null
    ? Number(content.voteAverage).toFixed(1)
    : null;

  return (
    <Link
      href={href}
      className="group relative flex-shrink-0 w-[140px] sm:w-[160px]"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted">
        {posterUrl ? (
          <Image
            src={posterUrl.startsWith('http') ? posterUrl : `${TMDB_IMAGE_BASE}/w342${posterUrl}`}
            alt={title}
            fill
            sizes="160px"
            className="object-cover transition-opacity group-hover:opacity-80"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            포스터 없음
          </div>
        )}
        {/* 순위 배지 */}
        <div className="absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white shadow-md">
          {item.rank}
        </div>
        {rating && Number(rating) > 0 && (
          <div className="absolute top-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
            {rating}
          </div>
        )}
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-card-foreground group-hover:text-primary">
        {title}
      </p>
    </Link>
  );
}
