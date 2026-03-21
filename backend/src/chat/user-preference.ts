import { UserContext, FavoriteContent, GenreStat, WantToWatchContent } from './prompts/system-prompt';

export interface UserPreference {
  preferredGenres: string[];       // 상위 5개 선호 장르 (DB 장르명)
  preferredCountries: string[];    // 선호 국가 ISO 코드 (상위 2개)
  ottProviderNames: string[];      // 구독 OTT TMDB provider_name
  hasData: boolean;                // 유저 데이터 존재 여부
}

// [동기화 주의] intent-analyzer.ts INTENT_SYSTEM_PROMPT의 OTT provider_name과 동일 유지
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

// 가중 점수 = avgRating * log2(count + 1)
// 평점이 높고 많이 본 장르일수록 높은 점수
// count >= MIN_GENRE_COUNT(2) 이상인 장르만 선호로 판별
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

// 리뷰 없는 watched 작품의 장르 빈도 기반 추출 (평점 없으므로 count만 사용)
function extractGenresFromWatchedGenres(watchedGenres: GenreStat[]): string[] {
  const sorted = [...watchedGenres].sort((a, b) => b.count - a.count);
  return sorted.slice(0, MAX_GENRES).map((g) => g.genre);
}

// wantToWatch 작품의 장르 빈도 기반 추출
function extractGenresFromWantToWatch(wantToWatch: WantToWatchContent[]): string[] {
  const genreCount = new Map<string, number>();

  for (const item of wantToWatch) {
    const genres = item.genres.split(',').map((g) => g.trim()).filter(Boolean);
    for (const genre of genres) {
      genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
    }
  }

  const sorted = [...genreCount.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, MAX_GENRES).map(([genre]) => genre);
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

function extractCountries(
  favorites: FavoriteContent[],
  wantToWatch: WantToWatchContent[],
): string[] {
  const countryCount = new Map<string, number>();

  const sources: { originCountry: string | null }[] = [...favorites, ...wantToWatch];
  for (const item of sources) {
    if (item.originCountry) {
      const countries = item.originCountry.split(',').map((c) => c.trim());
      for (const country of countries) {
        countryCount.set(country, (countryCount.get(country) ?? 0) + 1);
      }
    }
  }

  const sorted = [...countryCount.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, MAX_COUNTRIES).map(([country]) => country);
}

// OTT_ID_TO_TMDB_NAME에 없으면 null (한국어명은 TMDB provider_name과 매칭 불가)
function mapOttNames(
  subscribedOtts: string[],
): string[] {
  return subscribedOtts
    .map((id) => OTT_ID_TO_TMDB_NAME[id] ?? null)
    .filter((name): name is string => name !== null);
}

export function extractUserPreference(
  context: UserContext,
  subscribedOtts: string[],
): UserPreference {
  // 장르 추출 우선순위:
  // 1순위: genreStats (리뷰 평점 기반, 가중 점수)
  // 2순위: watchedGenres (리뷰 없는 watched 작품, 빈도 기반)
  // 3순위: favorites 장르 (고평점 작품 장르 빈도)
  // 4순위: wantToWatch 장르 (보고싶어요 작품 장르 빈도)
  let preferredGenres = extractGenresFromStats(context.genreStats);
  if (preferredGenres.length === 0 && context.watchedGenres.length > 0) {
    preferredGenres = extractGenresFromWatchedGenres(context.watchedGenres);
  }
  if (preferredGenres.length === 0 && context.favorites.length > 0) {
    preferredGenres = extractGenresFromFavorites(context.favorites);
  }
  if (preferredGenres.length === 0 && context.wantToWatch.length > 0) {
    preferredGenres = extractGenresFromWantToWatch(context.wantToWatch);
  }

  const preferredCountries = extractCountries(context.favorites, context.wantToWatch);

  const ottProviderNames = mapOttNames(subscribedOtts);

  const hasData = context.genreStats.length > 0
    || context.favorites.length > 0
    || context.watchedGenres.length > 0
    || context.wantToWatch.length > 0
    || subscribedOtts.length > 0;

  return {
    preferredGenres,
    preferredCountries,
    ottProviderNames,
    hasData,
  };
}
