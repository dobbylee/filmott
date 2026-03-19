export interface OttProvider {
  id: string;
  name: string;
  logoUrl: string; // TMDB 이미지 전체 URL
}

// [동기화 주의] backend/src/common/ott-providers.ts의 OTT_PROVIDERS와 동일 데이터
export const OTT_PROVIDERS: OttProvider[] = [
  { id: 'netflix', name: '넷플릭스', logoUrl: 'https://image.tmdb.org/t/p/w92/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  { id: 'disney_plus', name: '디즈니+', logoUrl: 'https://image.tmdb.org/t/p/w92/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg' },
  { id: 'watcha', name: '왓챠', logoUrl: 'https://image.tmdb.org/t/p/w92/2ioan5BX5L9tz4fIGU93blTeFhv.jpg' },
  { id: 'wavve', name: '웨이브', logoUrl: 'https://image.tmdb.org/t/p/w92/2LS0hJbEfSmU8DsHIRKGYUMoaje.jpg' },
  { id: 'tving', name: '티빙', logoUrl: 'https://image.tmdb.org/t/p/w92/cNi4Nv5EPsnvf5WmgwhfWDsdMUd.jpg' },
  { id: 'coupang_play', name: '쿠팡플레이', logoUrl: 'https://image.tmdb.org/t/p/w92/rXRJSNOHPIjIJNjSbLQYLe46J4p.jpg' },
];
