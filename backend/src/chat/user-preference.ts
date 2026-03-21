import { UserContext, FavoriteContent, GenreStat } from './prompts/system-prompt';
import { OttProvider } from '../common/ott-providers';

export interface UserPreference {
  preferredGenres: string[];       // 상위 5개 선호 장르 (DB 장르명)
  preferredCountries: string[];    // 선호 국가 ISO 코드 (상위 2개)
  ottProviderNames: string[];      // 구독 OTT TMDB provider_name
  hasData: boolean;                // 유저 데이터 존재 여부
}

const OTT_ID_TO_TMDB_NAME: Record<string, string> = {
  'netflix': 'Netflix',
  'disney_plus': 'Disney Plus',
  'watcha': 'Watcha',
  'wavve': 'wavve',
  'tving': 'Tving',
  'coupang_play': 'Coupang Play',
};

const MAX_GENRES = 5;
const MIN_GENRE_COUNT = 2;
const MAX_COUNTRIES = 2;

function extractGenresFromStats(genreStats: GenreStat[]): string[] {
  const eligible = genreStats.filter((g) => g.count >= MIN_GENRE_COUNT);

  if (eligible.length === 0) {
    return [];
  }

  const scored = eligible.map((g) => ({
    genre: g.genre,
    score: parseFloat(g.avgRating) * Math.log2(g.count + 1),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_GENRES).map((s) => s.genre);
}

function extractGenresFromFavorites(favorites: FavoriteContent[]): string[] {
  const genreCount = new Map<string, number>();

  for (const fav of favorites) {
    const genres = fav.genres.split(',').map((g) => g.trim()).filter(Boolean);
    for (const genre of genres) {
      genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
    }
  }

  const sorted = [...genreCount.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, MAX_GENRES).map(([genre]) => genre);
}

function extractCountries(favorites: FavoriteContent[]): string[] {
  const countryCount = new Map<string, number>();

  for (const fav of favorites) {
    if (fav.originCountry) {
      countryCount.set(
        fav.originCountry,
        (countryCount.get(fav.originCountry) ?? 0) + 1,
      );
    }
  }

  const sorted = [...countryCount.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, MAX_COUNTRIES).map(([country]) => country);
}

function mapOttNames(
  subscribedOtts: string[],
  ottProviders: OttProvider[],
): string[] {
  return subscribedOtts
    .map((id) => {
      const tmdbName = OTT_ID_TO_TMDB_NAME[id];
      if (tmdbName) return tmdbName;
      const provider = ottProviders.find((p) => p.id === id);
      return provider?.name ?? null;
    })
    .filter((name): name is string => name !== null);
}

export function extractUserPreference(
  context: UserContext,
  subscribedOtts: string[],
  ottProviders: OttProvider[],
): UserPreference {
  let preferredGenres = extractGenresFromStats(context.genreStats);
  if (preferredGenres.length === 0 && context.favorites.length > 0) {
    preferredGenres = extractGenresFromFavorites(context.favorites);
  }

  const preferredCountries = extractCountries(context.favorites);

  const ottProviderNames = mapOttNames(subscribedOtts, ottProviders);

  const hasData = context.genreStats.length > 0 || context.favorites.length > 0;

  return {
    preferredGenres,
    preferredCountries,
    ottProviderNames,
    hasData,
  };
}
