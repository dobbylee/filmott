export interface Genre {
  id: number;
  name: string;
}

export interface ContentItem {
  id: number;
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  releaseDate?: string;
  voteAverage?: number;
  genres: Genre[];
  runtime?: number;
  adult?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TmdbKnownForItem {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
}

export interface TmdbSearchItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  genres?: Genre[];
  // person-specific fields (from search/multi)
  profile_path?: string;
  known_for_department?: string;
  known_for?: TmdbKnownForItem[];
}

export interface TmdbSearchResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbSearchItem[];
  personTotal?: number;
  contentTotal?: number;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path?: string;
  order: number;
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface WatchProviderData {
  link?: string;
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
}

export interface PersonDetail {
  id: number;
  name: string;
  profile_path?: string;
  biography?: string;
  birthday?: string;
  place_of_birth?: string;
  known_for_department?: string;
}

export interface PersonCredit {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  character?: string;
  job?: string;
  episode_count?: number;
}

export interface PersonCreditsResult {
  cast: PersonCredit[];
  crew: PersonCredit[];
}

export interface ContentDetail extends ContentItem {
  watchProviders: WatchProviderData | null;
  credits: CastMember[];
}

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * TMDB 장르 ID -> 한글명 매핑.
 *
 * [동기화 주의]
 * 백엔드 backend/src/common/constants.ts의 GENRE_NAME_MAP과 동일한 데이터.
 * 한쪽을 수정하면 반드시 다른 쪽도 함께 업데이트할 것.
 */
export const GENRE_MAP: Record<number, string> = {
  28: '액션',
  12: '모험',
  16: '애니메이션',
  35: '코미디',
  80: '범죄',
  99: '다큐멘터리',
  18: '드라마',
  10751: '가족',
  14: '판타지',
  36: '역사',
  27: '공포',
  10402: '음악',
  9648: '미스터리',
  10749: '로맨스',
  878: 'SF',
  10770: 'TV 영화',
  53: '스릴러',
  10752: '전쟁',
  37: '서부',
  10759: '액션 & 어드벤처',
  10762: '키즈',
  10763: '뉴스',
  10764: '리얼리티',
  10765: 'SF & 판타지',
  10766: '소프 오페라',
  10767: '토크',
  10768: '전쟁 & 정치',
};

export const MOVIE_GENRES = [
  { id: 28, name: '액션' },
  { id: 12, name: '모험' },
  { id: 16, name: '애니메이션' },
  { id: 35, name: '코미디' },
  { id: 80, name: '범죄' },
  { id: 99, name: '다큐멘터리' },
  { id: 18, name: '드라마' },
  { id: 10751, name: '가족' },
  { id: 14, name: '판타지' },
  { id: 36, name: '역사' },
  { id: 27, name: '공포' },
  { id: 10402, name: '음악' },
  { id: 9648, name: '미스터리' },
  { id: 10749, name: '로맨스' },
  { id: 878, name: 'SF' },
  { id: 53, name: '스릴러' },
  { id: 10752, name: '전쟁' },
  { id: 37, name: '서부' },
];

export const TV_GENRES = [
  { id: 10759, name: '액션 & 어드벤처' },
  { id: 16, name: '애니메이션' },
  { id: 35, name: '코미디' },
  { id: 80, name: '범죄' },
  { id: 99, name: '다큐멘터리' },
  { id: 18, name: '드라마' },
  { id: 10751, name: '가족' },
  { id: 10762, name: '키즈' },
  { id: 9648, name: '미스터리' },
  { id: 10764, name: '리얼리티' },
  { id: 10765, name: 'SF & 판타지' },
  { id: 10768, name: '전쟁 & 정치' },
];

/**
 * OTT 제공사 목록.
 * logo는 TMDB logo_path 원본 형식 (예: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg').
 * 이미지 렌더링 시: `${TMDB_IMAGE_BASE}/original${provider.logo}` 형식으로 조합.
 */
export const OTT_PROVIDERS = [
  { id: 8, name: '넷플릭스', logo: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
  { id: 337, name: '디즈니+', logo: '/97yvRBw1GzX7fXprcF80er19ot.jpg' },
  { id: 356, name: '웨이브', logo: '/2ioan5BX5L9tz4fIGU93blTeFhv.jpg' },
  { id: 97, name: '왓챠', logo: '/681L3YVSY7FVjAufGKoagM17VEh.jpg' },
  { id: 350, name: '애플 TV+', logo: '/6uhKBfmtzFqOcLousHwZuzcrScK.jpg' },
  { id: 119, name: '아마존 프라임', logo: '/emthp39XA2YScoYL1p0sdbAH2WA.jpg' },
  { id: 1883, name: '티빙', logo: '/cNi4Nv5EPsnvf5WmgkyT1DDho3u.jpg' },
];
