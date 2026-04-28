'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

export default function StarRating({ value, onChange, max = 10 }: StarRatingProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Math.min(Math.max(e.currentTarget.valueAsNumber, 0), max);
    onChange(nextValue);
  };
  const ratingText = `${value}점`;
  const marks = Array.from({ length: max + 1 }, (_, index) => index);

  return (
    <div className="rounded-lg border border-input bg-background px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm">
        <Star className={`h-4 w-4 ${value > 0 ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/50'}`} />
        <span className="font-semibold text-foreground">{ratingText}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={handleChange}
        aria-label="별점 선택"
        aria-valuetext={ratingText}
        className="h-2 w-full cursor-pointer accent-fuchsia-600"
      />
      <div className="mt-2 grid grid-cols-11 text-center text-[10px] text-muted-foreground">
        {marks.map((mark) => (
          <span
            key={mark}
            className={mark === value ? 'font-semibold text-foreground' : ''}
          >
            {mark}
          </span>
        ))}
      </div>
    </div>
  );
}
