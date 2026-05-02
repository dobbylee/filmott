'use client';

import ErrorWithRetry from '@/components/common/ErrorWithRetry';

interface ContentDetailErrorProps {
  reset: () => void;
}

export default function ContentDetailError({ reset }: ContentDetailErrorProps) {
  return (
    <ErrorWithRetry
      message="작품 정보를 불러올 수 없습니다."
      onRetry={reset}
    />
  );
}
