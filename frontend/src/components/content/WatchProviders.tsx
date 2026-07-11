import TmdbImage from '@/components/common/TmdbImage';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { WatchProvider, WatchProviderData } from '@/types/content';

interface WatchProvidersProps {
  data: WatchProviderData | null;
  compact?: boolean;
}

// "Netflix Standard with Ads" → "Netflix"처럼 같은 서비스의 광고 버전을 제거
const ADS_PROVIDER_IDS = new Set([
  1796,  // Netflix Standard with Ads
  1899,  // Disney+ Standard with Ads
]);

function deduplicateProviders(
  providers: WatchProvider[],
): WatchProvider[] {
  return providers.filter(
    (provider, index, all) =>
      !ADS_PROVIDER_IDS.has(provider.provider_id) &&
      all.findIndex((item) => item.provider_id === provider.provider_id) === index,
  );
}

export default function WatchProviders({ data, compact = false }: WatchProvidersProps) {
  if (!data) return null;

  const hasAny = data.flatrate?.length || data.rent?.length || data.buy?.length;
  if (!hasAny) return null;

  // compact 모드: 서비스명은 추가하지 않고 이용 방식만 두 그룹으로 구분한다.
  if (compact) {
    const subscriptions = deduplicateProviders(data.flatrate ?? []);
    const rentOrBuy = deduplicateProviders([
      ...(data.rent ?? []),
      ...(data.buy ?? []),
    ]);
    if (subscriptions.length === 0 && rentOrBuy.length === 0) return null;

    const renderProviderLogos = (providers: WatchProvider[]) => (
      <div className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <div key={provider.provider_id} className="group relative">
            <TmdbImage
              src={`${TMDB_IMAGE_BASE}/w92${provider.logo_path}`}
              alt={provider.provider_name}
              width={32}
              height={32}
              className="rounded-md"
            />
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              {provider.provider_name}
            </span>
          </div>
        ))}
      </div>
    );

    return (
      <div className="space-y-2">
        {subscriptions.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="w-14 shrink-0 pt-2 text-xs text-muted-foreground">
              구독
            </span>
            {renderProviderLogos(subscriptions)}
          </div>
        )}
        {rentOrBuy.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="w-14 shrink-0 pt-2 text-xs text-muted-foreground">
              대여·구매
            </span>
            {renderProviderLogos(rentOrBuy)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.flatrate && deduplicateProviders(data.flatrate).length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            스트리밍
          </h4>
          <div className="flex flex-wrap gap-2">
            {deduplicateProviders(data.flatrate).map((p) => (
              <div key={p.provider_id} className="group relative">
                <TmdbImage
                  src={`${TMDB_IMAGE_BASE}/w92${p.logo_path}`}
                  alt={p.provider_name}
                  width={40}
                  height={40}
                  className="rounded-lg"
                />
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {p.provider_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.rent && deduplicateProviders(data.rent).length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            대여
          </h4>
          <div className="flex flex-wrap gap-2">
            {deduplicateProviders(data.rent).map((p) => (
              <div key={p.provider_id} className="group relative">
                <TmdbImage
                  src={`${TMDB_IMAGE_BASE}/w92${p.logo_path}`}
                  alt={p.provider_name}
                  width={40}
                  height={40}
                  className="rounded-lg"
                />
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {p.provider_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.buy && deduplicateProviders(data.buy).length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            구매
          </h4>
          <div className="flex flex-wrap gap-2">
            {deduplicateProviders(data.buy).map((p) => (
              <div key={p.provider_id} className="group relative">
                <TmdbImage
                  src={`${TMDB_IMAGE_BASE}/w92${p.logo_path}`}
                  alt={p.provider_name}
                  width={40}
                  height={40}
                  className="rounded-lg"
                />
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {p.provider_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
