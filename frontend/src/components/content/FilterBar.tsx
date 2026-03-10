'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { MOVIE_GENRES, TV_GENRES, OTT_PROVIDERS } from '@/types/content';

interface FilterBarProps {
  type: string;
  selectedGenres: number[];
  selectedProviders: number[];
  selectedYear?: number;
}

export default function FilterBar({
  type,
  selectedGenres,
  selectedProviders,
  selectedYear,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const genres = type === 'tv' ? TV_GENRES : MOVIE_GENRES;

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
    const next = selectedProviders.includes(providerId)
      ? selectedProviders.filter((id) => id !== providerId)
      : [...selectedProviders, providerId];
    updateParams({ providers: next.length > 0 ? next.join(',') : undefined });
  };

  const handleTypeChange = (newType: string) => {
    updateParams({ type: newType, genres: undefined });
  };

  const handleYearChange = (year: string) => {
    updateParams({ year: year || undefined });
  };

  return (
    <div className="space-y-4">
      {/* 타입 선택 */}
      <div className="flex gap-2">
        <button
          onClick={() => handleTypeChange('movie')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            type === 'movie'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          영화
        </button>
        <button
          onClick={() => handleTypeChange('tv')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            type === 'tv'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          TV 프로그램
        </button>
      </div>

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
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
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
          {OTT_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => toggleProvider(provider.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedProviders.includes(provider.id)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {provider.name}
            </button>
          ))}
        </div>
      </div>

      {/* 연도 필터 */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">연도</h3>
        <select
          value={selectedYear ?? ''}
          onChange={(e) => handleYearChange(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">전체</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
