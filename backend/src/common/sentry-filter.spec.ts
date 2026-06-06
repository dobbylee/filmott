import { NotFoundException } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import type { Event, EventHint } from '@sentry/core';
import { filterSentryEvent } from './sentry-filter';

describe('filterSentryEvent', () => {
  it('콘텐츠 상세 404는 Sentry로 보내지 않아야 한다', () => {
    const event: Event = {
      request: { url: 'https://filmott.kr/api/contents/movie/999999' },
      transaction: 'GET /api/contents/movie/:tmdbId',
    };
    const hint: EventHint = {
      originalException: new NotFoundException('콘텐츠를 찾을 수 없습니다.'),
    };

    expect(filterSentryEvent(event, hint)).toBeNull();
  });

  it('인물 상세와 크레딧 404는 Sentry로 보내지 않아야 한다', () => {
    const detailEvent: Event = {
      request: { url: 'https://filmott.kr/api/contents/person/999999' },
    };
    const creditsEvent: Event = {
      request: {
        url: 'https://filmott.kr/api/contents/person/999999/credits',
      },
    };
    const hint: EventHint = {
      originalException: new NotFoundException('인물을 찾을 수 없습니다.'),
    };

    expect(filterSentryEvent(detailEvent, hint)).toBeNull();
    expect(filterSentryEvent(creditsEvent, hint)).toBeNull();
  });

  it('콘텐츠/인물 상세 경로가 아닌 404는 유지해야 한다', () => {
    const event: Event = {
      request: { url: 'https://filmott.kr/api/reviews/999999' },
    };
    const hint: EventHint = {
      originalException: new NotFoundException('리뷰를 찾을 수 없습니다.'),
    };

    expect(filterSentryEvent(event, hint)).toBe(event);
  });

  it('404가 아닌 AxiosError는 유지해야 한다', () => {
    const event: Event = {
      request: { url: 'https://filmott.kr/api/contents/person/999999' },
    };
    const error = new AxiosError(
      'Request failed with status code 500',
      'ERR_BAD_RESPONSE',
      { headers: new AxiosHeaders() },
      null,
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {},
      },
    );

    expect(filterSentryEvent(event, { originalException: error })).toBe(event);
  });
});
