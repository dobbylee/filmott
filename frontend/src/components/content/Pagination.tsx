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
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="mt-8 flex items-center justify-center gap-1">
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm disabled:opacity-30"
        aria-label="이전 페이지"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {getVisiblePages()[0] > 1 && (
        <>
          <button
            onClick={() => goToPage(1)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm"
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
          className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm ${
            page === currentPage
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-secondary'
          }`}
        >
          {page}
        </button>
      ))}

      {getVisiblePages()[getVisiblePages().length - 1] < totalPages && (
        <>
          {getVisiblePages()[getVisiblePages().length - 1] < totalPages - 1 && (
            <span className="px-1 text-muted-foreground">...</span>
          )}
          <button
            onClick={() => goToPage(totalPages)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm disabled:opacity-30"
        aria-label="다음 페이지"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
