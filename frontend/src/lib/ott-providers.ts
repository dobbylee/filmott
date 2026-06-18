export interface OttProvider {
  id: string;
  name: string;
  logoUrl: string; // TMDB 이미지 전체 URL
}

// [동기화 주의] backend/src/common/ott-providers.ts의 OTT_PROVIDERS와 동일 데이터
export const OTT_PROVIDERS: OttProvider[] = [
  { id: 'netflix', name: '넷플릭스', logoUrl: 'https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
  { id: 'tving', name: '티빙', logoUrl: 'https://image.tmdb.org/t/p/w92/qHThQdkJuROK0k5QTCrknaNukWe.jpg' },
  { id: 'disney_plus', name: '디즈니+', logoUrl: 'https://image.tmdb.org/t/p/w92/97yvRBw1GzX7fXprcF80er19ot.jpg' },
  { id: 'watcha', name: '왓챠', logoUrl: 'https://image.tmdb.org/t/p/w92/5gmEivxOGPdq4Afpq1f8ktLtEW1.jpg' },
  { id: 'coupang_play', name: '쿠팡플레이', logoUrl: 'https://image.tmdb.org/t/p/w92/vpBRsCSyuwxwGDB2JeqyBVECUYF.jpg' },
  { id: 'wavve', name: '웨이브', logoUrl: 'https://image.tmdb.org/t/p/w92/2ioan5BX5L9tz4fIGU93blTeFhv.jpg' },
  { id: 'apple_tv_plus', name: '애플 TV+', logoUrl: 'https://image.tmdb.org/t/p/w92/6uhKBfmtzFqOcLousHwZuzcrScK.jpg' },
  { id: 'amazon_prime', name: '아마존 프라임', logoUrl: 'https://image.tmdb.org/t/p/w92/emthp39XA2YScoYL1p0sdbAH2WA.jpg' },
];
