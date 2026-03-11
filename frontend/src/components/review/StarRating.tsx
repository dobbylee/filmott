'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

export default function StarRating({ value, onChange, max = 10 }: StarRatingProps) {
  return (
    <div className="flex flex-wrap items-center gap-0 sm:gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => onChange(num)}
          className="p-1 sm:p-0.5 transition-transform hover:scale-110"
          aria-label={`${num}점`}
        >
          <Star
            className={`h-5 w-5 ${
              num <= value
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/40'
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-auto pr-1 sm:pr-0.5 text-sm font-semibold text-foreground">
          {value}점
        </span>
      )}
    </div>
  );
}
