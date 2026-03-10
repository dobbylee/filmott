import Image from 'next/image';
import { TMDB_IMAGE_BASE } from '@/types/content';
import type { WatchProviderData } from '@/types/content';

interface WatchProvidersProps {
  data: WatchProviderData | null;
}

export default function WatchProviders({ data }: WatchProvidersProps) {
  if (!data) return null;

  const hasAny = data.flatrate?.length || data.rent?.length || data.buy?.length;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {data.flatrate && data.flatrate.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            스트리밍
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.flatrate.map((p) => (
              <div key={p.provider_id} className="group relative">
                <Image
                  src={`${TMDB_IMAGE_BASE}/original${p.logo_path}`}
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

      {data.rent && data.rent.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            대여
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.rent.map((p) => (
              <div key={p.provider_id} className="group relative">
                <Image
                  src={`${TMDB_IMAGE_BASE}/original${p.logo_path}`}
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

      {data.buy && data.buy.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            구매
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.buy.map((p) => (
              <div key={p.provider_id} className="group relative">
                <Image
                  src={`${TMDB_IMAGE_BASE}/original${p.logo_path}`}
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
