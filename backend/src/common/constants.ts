/**
 * TMDB 이미지 CDN 베이스 URL
 * 사용 예: `${TMDB_IMAGE_BASE}/w500${posterPath}`
 */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * TMDB 장르 ID -> 한글명 매핑.
 * DB 저장 시 장르 name을 한글로 변환하여 jsonb에 포함.
 *
 * [동기화 주의]
 * 프론트엔드 frontend/src/types/content.ts의 GENRE_MAP과 동일한 데이터.
 * 한쪽을 수정하면 반드시 다른 쪽도 함께 업데이트할 것.
 */
export const GENRE_NAME_MAP: Record<number, string> = {
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

/**
 * 콘텐츠 상세 정보 캐시 TTL (24시간)
 * watchProviders, credits 등 부가 정보의 DB 캐시 유효 기간
 */
export const CONTENT_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
