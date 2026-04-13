'use client';

import { useState, useEffect } from 'react';

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

interface TimeAgoProps {
  date: string;
  className?: string;
}

export default function TimeAgo({ date, className }: TimeAgoProps) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      forceTick((value) => value + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return <span className={className} suppressHydrationWarning>{formatTimeAgo(date)}</span>;
}
