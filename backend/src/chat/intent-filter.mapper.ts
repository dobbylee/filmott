import type { ParsedIntent } from './intent-analyzer';
import type { ContentSearchFilters } from '../recommendation/recommendation-search.types';
import { getSearchableGenres } from './intent-genres';

export function buildFiltersFromIntent(
  intent: ParsedIntent,
): ContentSearchFilters {
  const filters: ContentSearchFilters = {};
  if (intent.ottProviderNames.length > 0)
    filters.ottProviderNames = intent.ottProviderNames;
  if (intent.countries.length > 0) filters.countries = intent.countries;
  if (intent.excludeCountries.length > 0)
    filters.excludeCountries = intent.excludeCountries;
  if (intent.personNames.length > 0) filters.personNames = intent.personNames;
  if (intent.dateRange && (intent.dateRange.from || intent.dateRange.to)) {
    filters.dateRange = intent.dateRange;
  }
  if (intent.contentType) filters.contentType = intent.contentType;
  const genres = getSearchableGenres(intent.genres, intent.contentType);
  if (genres.length > 0) filters.genres = genres;
  return filters;
}
