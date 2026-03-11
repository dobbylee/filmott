import ContentCard from './ContentCard';
import type { TmdbSearchItem } from '@/types/content';

interface ContentGridProps {
  items: TmdbSearchItem[];
  emptyMessage?: string;
}

export default function ContentGrid({
  items,
  emptyMessage = '결과가 없습니다.',
}: ContentGridProps) {
  // TMDB API가 같은 항목을 중복 반환할 수 있으므로 제거
  const unique = items.filter(
    (item, idx, arr) =>
      arr.findIndex(
        (v) => v.id === item.id && (v.media_type ?? 'movie') === (item.media_type ?? 'movie'),
      ) === idx,
  );

  if (unique.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {unique.map((item) => (
        <ContentCard key={`${item.media_type ?? 'movie'}-${item.id}`} item={item} />
      ))}
    </div>
  );
}
