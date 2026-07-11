import type {
  PersonCredit,
  PersonCreditsResult,
  PersonDetail,
} from '@/types/content';

function hasText(value?: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCompleteCredit(credit: PersonCredit): boolean {
  return (
    hasText(credit.poster_path) &&
    (hasText(credit.release_date) || hasText(credit.first_air_date))
  );
}

export function isPersonSearchIndexable(
  person: PersonDetail,
  credits: PersonCreditsResult,
): boolean {
  if (!hasText(person.biography) && !hasText(person.profile_path)) {
    return false;
  }

  const uniqueCredits = new Set<string>();
  for (const credit of [...credits.cast, ...credits.crew]) {
    if (!isCompleteCredit(credit)) continue;
    uniqueCredits.add(`${credit.media_type}:${credit.id}`);
  }

  return uniqueCredits.size >= 3;
}

export function contentMetadataDescription(
  title: string,
  overview?: string | null,
): string {
  const normalizedOverview = overview?.trim();
  return normalizedOverview
    ? normalizedOverview.slice(0, 160)
    : `${title} 상세 정보`;
}

export function personMetadataDescription(
  name: string,
  biography?: string | null,
): string {
  const normalizedBiography = biography?.trim();
  return normalizedBiography
    ? normalizedBiography.slice(0, 160)
    : `${name}의 출연작 목록`;
}
