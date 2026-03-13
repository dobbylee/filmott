'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export default function Pagination({ currentPage, totalPages }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`?${params.toString()}`);
  };

  const getVisiblePages = (): number[] => {
    if (currentPage <= 3) {
      const end = Math.min(totalPages, 4);
      return Array.from({ length: end }, (_, i) => i + 1);
    }
    const pages = [currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
    return pages.filter((p) => p >= 1 && p <= totalPages);
  };

  return (
    <div className="mt-8 flex items-center justify-center gap-1">
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="mr-2 flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/70"
        aria-label="이전 페이지"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {getVisiblePages()[0] > 1 && (
        <>
          <button
            onClick={() => goToPage(1)}
            className="flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-border text-sm"
          >
            1
          </button>
          {getVisiblePages()[0] > 2 && (
            <span className="px-1 text-muted-foreground">...</span>
          )}
        </>
      )}

      {getVisiblePages().map((page) => (
        <button
          key={page}
          onClick={() => goToPage(page)}
          className={`flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-md border text-sm ${
            page === currentPage
              ? 'border-transparent bg-gradient-to-br from-fuchsia-600 to-blue-500 text-white'
              : 'border-border hover:bg-secondary'
          }`}
        >
          {page}
        </button>
      ))}


      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="ml-2 flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/70"
        aria-label="다음 페이지"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
