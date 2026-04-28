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
  const ratingText = value > 0 ? `${value}점` : '선택 안 함';

  return (
    <div className="rounded-lg border border-input bg-background px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Star className={`h-4 w-4 ${value > 0 ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/50'}`} />
          <span>0</span>
        </div>
        <span className="text-sm font-semibold text-foreground">{ratingText}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={handleChange}
        aria-label="별점 선택"
        aria-valuetext={value > 0 ? `${value}점` : '미선택'}
        className="h-2 w-full cursor-pointer accent-fuchsia-600"
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>선택 안 함</span>
        <span>{max}점</span>
      </div>
    </div>
  );
}
