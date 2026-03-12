'use client';

import { ChevronDown } from 'lucide-react';

interface YearFilterProps {
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
}

export default function YearFilter({ years, selectedYear, onYearChange }: YearFilterProps) {
  if (years.length === 0) return null;

  return (
    <div className="relative inline-block">
      <select
        value={selectedYear}
        onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
        className="appearance-none rounded-lg border border-white/10 bg-white/5 py-2 pl-4 pr-9 text-sm font-medium text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20"
      >
        {years.map((year) => (
          <option key={year} value={year} className="bg-[#111] text-white">
            {year}년
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
    </div>
  );
}
