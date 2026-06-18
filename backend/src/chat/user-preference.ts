import {
  UserContext,
  FavoriteContent,
  GenreStat,
  WantToWatchContent,
} from './prompts/system-prompt';

export interface UserPreference {
  preferredGenres: string[]; // 상위 5개 선호 장르 (DB 장르명)
  preferredCountries: string[]; // 선호 국가 ISO 코드 (상위 2개)
  ottProviderNames: string[]; // 구독 OTT TMDB provider_name
  hasData: boolean; // 유저 데이터 존재 여부
  excludeGenres: string[]; // 비선호 장르 (disliked 2회 이상)
  excludePersonNames: string[]; // 비선호 감독 (disliked 2회 이상)
}

// [동기화 주의] intent-analyzer.ts INTENT_SYSTEM_PROMPT의 OTT provider_name과 동일 유지
const OTT_ID_TO_TMDB_NAME: Record<string, string> = {
  netflix: 'Netflix',
  disney_plus: 'Disney Plus',
  watcha: 'Watcha',
  wavve: 'wavve',
  apple_tv_plus: 'Apple TV Plus',
  amazon_prime: 'Amazon Prime Video',
  tving: 'Tving',
  coupang_play: 'Coupang Play',
};

const MAX_GENRES = 5;
const MIN_GENRE_COUNT = 2;
const MAX_COUNTRIES = 2;
const MIN_DISLIKE_COUNT = 2;

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
function extractGenresFromWantToWatch(
  wantToWatch: WantToWatchContent[],
): string[] {
  const genreCount = new Map<string, number>();

  for (const item of wantToWatch) {
    const genres = item.genres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
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
    const genres = fav.genres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
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

  const sources: { originCountry: string | null }[] = [
    ...favorites,
    ...wantToWatch,
  ];
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

// disliked 작품에서 2회 이상 등장한 장르를 제외 대상으로 추출
// preferredGenres와 겹치는 장르는 제외하지 않음 (선호 > 비선호)
function extractExcludeGenres(
  disliked: FavoriteContent[],
  preferredGenres: string[],
): string[] {
  const genreCount = new Map<string, number>();
  for (const item of disliked) {
    const genres = item.genres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    for (const genre of genres) {
      genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
    }
  }
  return [...genreCount.entries()]
    .filter(
      ([genre, count]) =>
        count >= MIN_DISLIKE_COUNT && !preferredGenres.includes(genre),
    )
    .map(([genre]) => genre);
}

// disliked 작품에서 2회 이상 등장한 감독을 제외 대상으로 추출
function extractExcludePersonNames(disliked: FavoriteContent[]): string[] {
  const directorCount = new Map<string, number>();
  for (const item of disliked) {
    if (item.director) {
      directorCount.set(
        item.director,
        (directorCount.get(item.director) ?? 0) + 1,
      );
    }
  }
  return [...directorCount.entries()]
    .filter(([, count]) => count >= MIN_DISLIKE_COUNT)
    .map(([name]) => name);
}

// OTT_ID_TO_TMDB_NAME에 없으면 null (한국어명은 TMDB provider_name과 매칭 불가)
function mapOttNames(subscribedOtts: string[]): string[] {
  return subscribedOtts
    .map((id) => OTT_ID_TO_TMDB_NAME[id] ?? null)
    .filter((name): name is string => name !== null);
}

// ISO 코드 → 한국어 국가명 (임베딩 쿼리 보강용)
const ISO_TO_KOREAN: Record<string, string> = {
  KR: '한국',
  US: '미국',
  JP: '일본',
  GB: '영국',
  FR: '프랑스',
  DE: '독일',
  CN: '중국',
  TW: '대만',
  HK: '홍콩',
  IN: '인도',
  ES: '스페인',
  IT: '이탈리아',
  CA: '캐나다',
  AU: '호주',
  TH: '태국',
};

// TMDB provider_name → 한국어 OTT명 (임베딩 쿼리 보강용)
const TMDB_NAME_TO_KOREAN: Record<string, string> = {
  Netflix: '넷플릭스',
  'Disney Plus': '디즈니플러스',
  Watcha: '왓챠',
  wavve: '웨이브',
  'Apple TV Plus': '애플 TV+',
  'Amazon Prime Video': '아마존 프라임',
  Tving: '티빙',
  'Coupang Play': '쿠팡플레이',
};

/**
 * 임베딩 쿼리에 유저 선호를 주입하여 벡터 유사도를 개인화한다.
 * 명시적 요청이 있는 필드에는 주입하지 않는다 (WHERE 필터 합산과 동일 원칙).
 */
export function enrichQueryWithPreference(
  semanticQuery: string,
  userPref: UserPreference,
  intent: {
    ottProviderNames: string[];
    countries: string[];
    excludeCountries: string[];
  },
): string {
  const additions: string[] = [];

  // OTT: 명시적 OTT 요청 없을 때만 유저 구독 OTT 주입
  if (
    intent.ottProviderNames.length === 0 &&
    userPref.ottProviderNames.length > 0
  ) {
    const koreanOtt = userPref.ottProviderNames
      .map((name) => TMDB_NAME_TO_KOREAN[name])
      .filter(Boolean);
    if (koreanOtt.length > 0) {
      additions.push(koreanOtt[0]); // 첫 번째 구독 OTT만 (너무 많으면 임베딩 희석)
    }
  }

  // 국가: 명시적 국가/제외 요청 없을 때만 유저 선호 국가 주입
  if (
    intent.countries.length === 0 &&
    intent.excludeCountries.length === 0 &&
    userPref.preferredCountries.length > 0
  ) {
    const koreanCountry = ISO_TO_KOREAN[userPref.preferredCountries[0]];
    if (koreanCountry) {
      additions.push(koreanCountry);
    }
  }

  if (additions.length === 0) {
    return semanticQuery;
  }

  return `${additions.join(' ')} ${semanticQuery}`;
}

export function extractUserPreference(
  context: UserContext,
  subscribedOtts: string[],
  intentPersonNames: string[] = [],
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

  const preferredCountries = extractCountries(
    context.favorites,
    context.wantToWatch,
  );

  const ottProviderNames = mapOttNames(subscribedOtts);

  const hasData =
    context.genreStats.length > 0 ||
    context.favorites.length > 0 ||
    context.watchedGenres.length > 0 ||
    context.wantToWatch.length > 0 ||
    subscribedOtts.length > 0;

  const excludeGenres = extractExcludeGenres(context.disliked, preferredGenres);
  const excludePersonNames = extractExcludePersonNames(context.disliked).filter(
    (name) => !intentPersonNames.includes(name),
  );

  return {
    preferredGenres,
    preferredCountries,
    ottProviderNames,
    hasData,
    excludeGenres,
    excludePersonNames,
  };
}
