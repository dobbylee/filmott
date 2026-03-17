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
    <div className="flex gap-1">
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSortChange(option.value)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            sort === option.value
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
