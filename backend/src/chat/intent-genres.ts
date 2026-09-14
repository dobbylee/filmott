import { GENRE_NAME_MAP } from '../common/constants';

export const CANONICAL_GENRES = Object.values(GENRE_NAME_MAP);

// 사용자 표현 목록이 아니라 TMDB의 영화/TV 장르 분류다. 이름은 공용 원본을 쓴다.
export const MOVIE_INTENT_GENRES = [
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770,
  53, 10752, 37,
].map((id) => GENRE_NAME_MAP[id]);
export const TV_INTENT_GENRES = [
  10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766,
  10767, 10768, 37,
].map((id) => GENRE_NAME_MAP[id]);

const canonicalGenres = new Set(CANONICAL_GENRES);
const movieGenres = new Set(MOVIE_INTENT_GENRES);
const tvGenres = new Set(TV_INTENT_GENRES);

// 기존의 소수 별칭만 방어적으로 호환한다. 새 표현의 정규화는 LLM이 담당한다.
export const GENRE_ALIAS_MAP: Record<string, string[]> = {
  호러: ['공포'],
  느와르: ['범죄', '액션'],
  예능: ['리얼리티', '토크'],
  버라이어티: ['리얼리티', '토크'],
  토크쇼: ['토크'],
};

const TV_GENRE_EXPANSION: Record<string, string> = {
  액션: '액션 & 어드벤처',
  판타지: 'SF & 판타지',
  SF: 'SF & 판타지',
};

export function normalizeIntentGenres(
  genres: string[],
  contentType: 'movie' | 'tv' | null,
): string[] {
  const normalized = new Set<string>();
  for (const value of genres) {
    const genre = value.trim();
    const names = Object.hasOwn(GENRE_ALIAS_MAP, genre)
      ? GENRE_ALIAS_MAP[genre]
      : [genre];
    for (const name of names) {
      if (canonicalGenres.has(name)) normalized.add(name);
    }
  }
  if (contentType !== 'movie') {
    for (const genre of [...normalized]) {
      if (Object.hasOwn(TV_GENRE_EXPANSION, genre)) {
        normalized.add(TV_GENRE_EXPANSION[genre]);
      }
    }
  }
  return [...normalized];
}

export function getSearchableGenres(
  genres: string[],
  contentType: 'movie' | 'tv' | null,
): string[] {
  const supported =
    contentType === 'movie'
      ? movieGenres
      : contentType === 'tv'
        ? tvGenres
        : canonicalGenres;
  return [...new Set(genres)].filter((genre) => supported.has(genre));
}
