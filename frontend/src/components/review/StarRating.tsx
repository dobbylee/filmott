'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

export default function StarRating({ value, onChange, max = 10 }: StarRatingProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onChange(num)}
            className="p-0.5 transition-transform hover:scale-110"
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
        <span className="ml-2 text-sm font-semibold text-foreground">
          {value > 0 ? `${value}점` : ''}
        </span>
      </div>
    </div>
  );
}
