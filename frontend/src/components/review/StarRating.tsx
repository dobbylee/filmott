'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

export default function StarRating({ value, onChange, max = 10 }: StarRatingProps) {
  const handleKeyDown = (e: React.KeyboardEvent, num: number) => {
    if (e.key === 'ArrowRight' && num < max) {
      e.preventDefault();
      onChange(num + 1);
    } else if (e.key === 'ArrowLeft' && num > 1) {
      e.preventDefault();
      onChange(num - 1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0 sm:gap-1" role="radiogroup" aria-label="별점 선택">
      {Array.from({ length: max }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          type="button"
          role="radio"
          aria-checked={num === value}
          aria-label={`${num}점`}
          tabIndex={num === value || (value === 0 && num === 1) ? 0 : -1}
          onClick={() => onChange(num)}
          onKeyDown={(e) => handleKeyDown(e, num)}
          className="p-1 sm:p-0.5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded"
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
