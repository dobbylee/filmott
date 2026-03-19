export interface OttProvider {
  id: string;          // 내부 식별자 (예: 'netflix')
  name: string;        // 표시명 (예: '넷플릭스')
  tmdbProviderId: number; // TMDB provider_id (예: 8)
  logoPath: string;    // TMDB 로고 경로
}

// [동기화 주의] frontend/src/lib/ott-providers.ts와 동일 데이터 유지
export const OTT_PROVIDERS: OttProvider[] = [
  { id: 'netflix', name: '넷플릭스', tmdbProviderId: 8, logoPath: '/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  { id: 'disney_plus', name: '디즈니+', tmdbProviderId: 337, logoPath: '/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg' },
  { id: 'watcha', name: '왓챠', tmdbProviderId: 97, logoPath: '/2ioan5BX5L9tz4fIGU93blTeFhv.jpg' },
  { id: 'wavve', name: '웨이브', tmdbProviderId: 356, logoPath: '/2LS0hJbEfSmU8DsHIRKGYUMoaje.jpg' },
  { id: 'tving', name: '티빙', tmdbProviderId: 1796, logoPath: '/cNi4Nv5EPsnvf5WmgwhfWDsdMUd.jpg' },
  { id: 'coupang_play', name: '쿠팡플레이', tmdbProviderId: 2037, logoPath: '/rXRJSNOHPIjIJNjSbLQYLe46J4p.jpg' },
];

export const VALID_OTT_IDS = OTT_PROVIDERS.map((p) => p.id);
