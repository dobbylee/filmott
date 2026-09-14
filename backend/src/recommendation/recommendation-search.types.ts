export const FILTER_RELAXATION_SEQUENCE = [
  'genres',
  'personNames',
  'countries',
  'ottProviderNames',
] as const;

export type RelaxableFilterKey = (typeof FILTER_RELAXATION_SEQUENCE)[number];

export interface ContentSearchFilters {
  ottProviderNames?: string[];
  countries?: string[];
  excludeCountries?: string[];
  personNames?: string[];
  dateRange?: { from: string | null; to: string | null };
  contentType?: 'movie' | 'tv';
  genres?: string[];
  excludeGenres?: string[];
  excludePersonNames?: string[];
  relaxableFilterKeys?: RelaxableFilterKey[];
}
