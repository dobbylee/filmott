'use client';

type ReviewSort = 'latest' | 'likes';

interface ReviewSortSelectorProps {
  sort: ReviewSort;
  onSortChange: (sort: ReviewSort) => void;
}

const SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'likes', label: '인기순' },
];

export default function ReviewSortSelector({ sort, onSortChange }: ReviewSortSelectorProps) {
  return (
    <div className="flex rounded-full bg-white/5 border border-white/10 p-0.5">
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSortChange(option.value)}
          className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full transition-all duration-200 ${
            sort === option.value
              ? 'bg-white/15 text-white'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
