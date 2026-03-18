'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="bg-[#0a0a0a]">
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-black text-white/20">500</h1>
            <p className="mt-4 text-lg text-white/50">
              예상치 못한 오류가 발생했습니다
            </p>
            <button
              onClick={() => reset()}
              className="mt-6 inline-block rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white"
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
