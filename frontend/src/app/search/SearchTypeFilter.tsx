'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface SearchTypeFilterProps {
  currentType?: string;
}

export default function SearchTypeFilter({ currentType }: SearchTypeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setType = (type: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type) {
      params.set('type', type);
    } else {
      params.delete('type');
    }
    params.delete('page');
    router.push(`/search?${params.toString()}`);
  };

  const types = [
    { value: undefined, label: '전체' },
    { value: 'movie', label: '영화' },
    { value: 'tv', label: 'TV' },
    { value: 'person', label: '인물' },
  ];

  return (
    <div className="mb-4 flex gap-2">
      {types.map(({ value, label }) => (
        <button
          key={label}
          onClick={() => setType(value)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            currentType === value ||
            (value === undefined && !currentType)
              ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-600/30'
              : 'bg-white/5 text-white/40 hover:text-white/70'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
