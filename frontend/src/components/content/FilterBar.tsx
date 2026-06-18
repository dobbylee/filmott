'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { MOVIE_GENRES, TV_GENRES, OTT_PROVIDERS } from '@/types/content';

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: '인기순' },
  { value: 'primary_release_date.desc', label: '최신순' },
  { value: 'vote_average.desc', label: '평점순' },
  { value: 'revenue.desc', label: '수익순', movieOnly: true },
] as const;

const COUPANG_PLAY_PROVIDER_ID = 1881;

interface FilterBarProps {
  type: string;
  selectedGenres: number[];
  selectedProviders: number[];
  selectedYear?: number;
  selectedSort?: string;
}

export default function FilterBar({
  type,
  selectedGenres,
  selectedProviders,
  selectedYear,
  selectedSort,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const genres = type === 'tv' ? TV_GENRES : MOVIE_GENRES;
  const visibleProviders = OTT_PROVIDERS.filter(
    (provider) => type === 'tv' || provider.id !== COUPANG_PLAY_PROVIDER_ID,
  );

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.delete('page');
      router.push(`/discover?${params.toString()}`);
    },
    [router, searchParams],
  );

  const toggleGenre = (genreId: number) => {
    const next = selectedGenres.includes(genreId)
      ? selectedGenres.filter((id) => id !== genreId)
      : [...selectedGenres, genreId];
    updateParams({ genres: next.length > 0 ? next.join(',') : undefined });
  };

  const toggleProvider = (providerId: number) => {
    const isSelected = selectedProviders.includes(providerId);
    updateParams({ providers: isSelected ? undefined : String(providerId) });
  };

  const handleYearChange = (year: string) => {
    updateParams({ year: year || undefined });
  };

  return (
    <div className="space-y-4">
      {/* 장르 필터 */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">장르</h3>
        <div className="flex flex-wrap gap-1.5">
          {genres.map((genre) => (
            <button
              key={genre.id}
              onClick={() => toggleGenre(genre.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedGenres.includes(genre.id)
                  ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-600/30'
                  : 'bg-white/5 text-white/80 hover:text-white'
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </div>

      {/* OTT 필터 */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">OTT</h3>
        <div className="flex flex-wrap gap-1.5">
          {visibleProviders.map((provider) => (
            <button
              key={provider.id}
              onClick={() => toggleProvider(provider.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedProviders.includes(provider.id)
                  ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-600/30'
                  : 'bg-white/5 text-white/80 hover:text-white'
              }`}
            >
              {provider.name}
            </button>
          ))}
        </div>
      </div>

      {/* 정렬 + 연도 */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">정렬</h3>
          <div className="flex gap-1.5">
            {SORT_OPTIONS.filter((option) => !('movieOnly' in option && option.movieOnly) || type === 'movie').map((option) => (
              <button
                key={option.value}
                onClick={() => updateParams({
                  sort: option.value === 'popularity.desc' ? undefined : option.value,
                })}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  (selectedSort ?? 'popularity.desc') === option.value
                    ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-600/30'
                    : 'bg-white/5 text-white/80 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">연도</h3>
          <div className="relative inline-block">
            <select
              value={selectedYear ?? ''}
              onChange={(e) => handleYearChange(e.target.value)}
              className="appearance-none rounded-lg border border-white/10 bg-white/5 py-2 pl-4 pr-9 text-sm font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              <option value="" className="bg-[#111] text-white">전체</option>
              {years.map((year) => (
                <option key={year} value={year} className="bg-[#111] text-white">
                  {year}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
