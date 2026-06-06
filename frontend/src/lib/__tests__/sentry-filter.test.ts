import { describe, expect, it } from 'vitest';
import type { Event, EventHint } from '@sentry/core';
import { ApiError } from '@/lib/fetcher';
import { filterSentryEvent } from '@/lib/sentry-filter';

describe('filterSentryEvent', () => {
  it('작품 상세 404는 Sentry로 보내지 않아야 한다', () => {
    const event: Event = {
      request: { url: 'https://filmott.kr/contents/movie/999999' },
      transaction: 'GET /contents/movie/:tmdbId',
    };
    const hint: EventHint = {
      originalException: new ApiError('찾을 수 없습니다.', 404, 'Not Found'),
    };

    expect(filterSentryEvent(event, hint)).toBeNull();
  });

  it('인물 상세 404는 Sentry로 보내지 않아야 한다', () => {
    const event: Event = {
      request: { url: 'https://filmott.kr/person/999999' },
    };
    const hint: EventHint = {
      originalException: new ApiError('찾을 수 없습니다.', 404, 'Not Found'),
    };

    expect(filterSentryEvent(event, hint)).toBeNull();
  });

  it('대상 경로가 아닌 404는 유지해야 한다', () => {
    const event: Event = {
      request: { url: 'https://filmott.kr/profile/999999' },
    };
    const hint: EventHint = {
      originalException: new ApiError('찾을 수 없습니다.', 404, 'Not Found'),
    };

    expect(filterSentryEvent(event, hint)).toBe(event);
  });
});
