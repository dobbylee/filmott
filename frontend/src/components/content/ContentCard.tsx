import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE, GENRE_MAP } from '@/types/content';
import type { TmdbSearchItem } from '@/types/content';

interface ContentCardProps {
  item: TmdbSearchItem;
}

export default function ContentCard({ item }: ContentCardProps) {
  const title = item.title ?? item.name ?? '제목 없음';
  const releaseDate = item.release_date ?? item.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  const rating = item.vote_average != null
    ? Number(item.vote_average).toFixed(1)
    : null;
  const genreNames = (item.genre_ids ?? [])
    .slice(0, 3)
    .map((id) => GENRE_MAP[id])
    .filter(Boolean);

  return (
    <Link
      href={`/contents/${type}/${item.id}`}
      className="group block overflow-hidden rounded-lg bg-card transition-transform hover:scale-[1.02]"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {item.poster_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-opacity group-hover:opacity-80"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <span className="text-sm">포스터 없음</span>
          </div>
        )}
        {rating && Number(rating) > 0 && (
          <div className="absolute top-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-yellow-400">
            {rating}
          </div>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="truncate text-sm font-medium text-card-foreground group-hover:text-primary">
          {title}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {year && <span>{year}</span>}
          <span className="capitalize text-muted-foreground/70">
            {type === 'tv' ? 'TV' : '영화'}
          </span>
        </div>
        {genreNames.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {genreNames.map((genre) => (
              <span
                key={genre}
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
