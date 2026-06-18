export interface OttProvider {
  id: string; // 내부 식별자 (예: 'netflix')
  name: string; // 표시명 (예: '넷플릭스')
  tmdbProviderId: number; // TMDB provider_id (예: 8)
  logoPath: string; // TMDB 로고 경로
}

// [동기화 주의] frontend/src/lib/ott-providers.ts와 동일 데이터 유지
export const OTT_PROVIDERS: OttProvider[] = [
  {
    id: 'netflix',
    name: '넷플릭스',
    tmdbProviderId: 8,
    logoPath: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
  },
  {
    id: 'tving',
    name: '티빙',
    tmdbProviderId: 1883,
    logoPath: '/qHThQdkJuROK0k5QTCrknaNukWe.jpg',
  },
  {
    id: 'disney_plus',
    name: '디즈니+',
    tmdbProviderId: 337,
    logoPath: '/97yvRBw1GzX7fXprcF80er19ot.jpg',
  },
  {
    id: 'watcha',
    name: '왓챠',
    tmdbProviderId: 97,
    logoPath: '/5gmEivxOGPdq4Afpq1f8ktLtEW1.jpg',
  },
  {
    id: 'coupang_play',
    name: '쿠팡플레이',
    tmdbProviderId: 1881,
    logoPath: '/vpBRsCSyuwxwGDB2JeqyBVECUYF.jpg',
  },
  {
    id: 'wavve',
    name: '웨이브',
    tmdbProviderId: 356,
    logoPath: '/2ioan5BX5L9tz4fIGU93blTeFhv.jpg',
  },
  {
    id: 'apple_tv_plus',
    name: '애플 TV+',
    tmdbProviderId: 350,
    logoPath: '/6uhKBfmtzFqOcLousHwZuzcrScK.jpg',
  },
  {
    id: 'amazon_prime',
    name: '아마존 프라임',
    tmdbProviderId: 119,
    logoPath: '/emthp39XA2YScoYL1p0sdbAH2WA.jpg',
  },
];

export const VALID_OTT_IDS = OTT_PROVIDERS.map((p) => p.id);

export const DISCOVER_TMDB_PROVIDER_IDS = OTT_PROVIDERS.map(
  (p) => p.tmdbProviderId,
);
