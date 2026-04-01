import TmdbImage from '@/components/common/TmdbImage';
import Link from 'next/link';
import { User } from 'lucide-react';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { TmdbSearchItem } from '@/types/content';

interface PersonCardProps {
  person: TmdbSearchItem;
}

const DEPARTMENT_MAP: Record<string, string> = {
  Acting: '배우',
  Directing: '감독',
  Writing: '작가',
  Production: '제작',
  Sound: '음악',
  Camera: '촬영',
  Art: '미술',
  Editing: '편집',
};

export default function PersonCard({ person }: PersonCardProps) {
  const department = person.known_for_department
    ? DEPARTMENT_MAP[person.known_for_department] ?? person.known_for_department
    : '';

  const knownForTitles = (person.known_for ?? [])
    .slice(0, 3)
    .map((item) => item.title ?? item.name)
    .filter(Boolean)
    .join(', ');

  return (
    <Link
      href={`/person/${person.id}`}
      className="group block hover:-translate-y-1 transition-all duration-300"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 border border-white/5 p-4 transition-colors group-hover:bg-white/10 group-hover:border-white/10">
        {/* Profile Image */}
        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-full bg-white/5 border border-white/10">
          {person.profile_path ? (
            <TmdbImage
              src={`${TMDB_IMAGE_BASE}/w185${person.profile_path}`}
              alt={person.name ?? ''}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30">
              <User className="h-10 w-10" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-bold text-white group-hover:text-primary transition-colors">
            {person.name ?? '이름 없음'}
          </p>
          {department && (
            <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {department}
            </span>
          )}
          {knownForTitles && (
            <p className="mt-1.5 line-clamp-1 text-xs text-white/50">
              {knownForTitles}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
