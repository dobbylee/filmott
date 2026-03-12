import type { Metadata } from 'next';
import Image from 'next/image';
import { Calendar, User } from 'lucide-react';
import { fetchApi } from '@/lib/fetcher';
import FilmographyGrid from '@/components/content/FilmographyGrid';
import {
  TMDB_IMAGE_BASE,
  type PersonDetail,
  type PersonCreditsResult,
  type PersonCredit,
  type TmdbSearchItem,
} from '@/types/content';

interface PersonPageProps {
  params: Promise<{
    personId: string;
  }>;
}

const DEPARTMENT_MAP: Record<string, string> = {
  Acting: '배우',
  Directing: '감독',
  Writing: '작가',
  Production: '제작',
  'Sound': '음악',
  'Camera': '촬영',
  'Art': '미술',
  'Editing': '편집',
};

function formatDepartment(dept?: string): string {
  if (!dept) return '';
  return DEPARTMENT_MAP[dept] ?? dept;
}

function formatBirthday(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function deduplicateCredits(
  cast: PersonCredit[],
  crew: PersonCredit[],
): TmdbSearchItem[] {
  const seen = new Set<string>();
  const result: TmdbSearchItem[] = [];

  const allCredits = [...cast, ...crew];

  // Sort by date descending (newest first), items without dates go last
  allCredits.sort((a, b) => {
    const dateA = a.release_date ?? a.first_air_date ?? '';
    const dateB = b.release_date ?? b.first_air_date ?? '';
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB.localeCompare(dateA);
  });

  for (const credit of allCredits) {
    const key = `${credit.media_type}-${credit.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      id: credit.id,
      media_type: credit.media_type,
      title: credit.title,
      name: credit.name,
      poster_path: credit.poster_path,
      release_date: credit.release_date,
      first_air_date: credit.first_air_date,
      vote_average: credit.vote_average,
    });
  }

  return result;
}

export async function generateMetadata({
  params,
}: PersonPageProps): Promise<Metadata> {
  const { personId } = await params;
  try {
    const person = await fetchApi<PersonDetail>(
      `/contents/person/${personId}`,
      { next: { revalidate: 3600 } },
    );
    return {
      title: `${person.name} 필모그래피 - filmott`,
      description: person.biography?.slice(0, 160) ?? `${person.name}의 출연작 목록`,
      openGraph: {
        title: `${person.name} 필모그래피`,
        description: person.biography?.slice(0, 160) ?? '',
        images: person.profile_path
          ? [`${TMDB_IMAGE_BASE}/w500${person.profile_path}`]
          : [],
      },
    };
  } catch {
    return { title: '인물 정보 - filmott' };
  }
}

export default async function PersonPage({ params }: PersonPageProps) {
  const { personId } = await params;

  let person: PersonDetail;
  let credits: PersonCreditsResult;

  try {
    [person, credits] = await Promise.all([
      fetchApi<PersonDetail>(
        `/contents/person/${personId}`,
        { next: { revalidate: 3600 } },
      ),
      fetchApi<PersonCreditsResult>(
        `/contents/person/${personId}/credits`,
        { next: { revalidate: 3600 } },
      ),
    ]);
  } catch {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">인물 정보를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const items = deduplicateCredits(credits.cast, credits.crew);
  const department = formatDepartment(person.known_for_department);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Profile Section */}
      <div className="mb-12 flex flex-col items-center gap-8 md:flex-row md:items-start">
        {/* Profile Image */}
        <div className="flex-shrink-0">
          <div className="relative h-[300px] w-[200px] overflow-hidden rounded-2xl bg-white/5 border border-white/10 shadow-xl">
            {person.profile_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/w500${person.profile_path}`}
                alt={person.name}
                fill
                sizes="200px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/30">
                <User className="h-16 w-16" />
                <span className="text-xs">이미지 없음</span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-3xl font-bold md:text-4xl">{person.name}</h1>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground md:justify-start">
            {department && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {department}
              </span>
            )}
            {person.birthday && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatBirthday(person.birthday)}
              </span>
            )}
            {person.place_of_birth && (
              <span className="text-white/50">
                {person.place_of_birth}
              </span>
            )}
          </div>

          {person.biography && (
            <p className="mt-5 max-w-3xl leading-relaxed text-muted-foreground">
              {person.biography}
            </p>
          )}
        </div>
      </div>

      {/* Filmography */}
      <section>
        <h2 className="mb-6 text-xl font-bold">
          작품
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {items.length}
          </span>
        </h2>
        <FilmographyGrid items={items} />
      </section>
    </div>
  );
}
