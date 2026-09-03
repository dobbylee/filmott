import { NotFoundException } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import type {
  Breadcrumb,
  Event,
  EventHint,
  SpanJSON,
  TransactionEvent,
} from '@sentry/core';
import {
  filterSentryEvent,
  sanitizeSentryBreadcrumb,
  sanitizeSentrySpan,
  sanitizeSentryTransaction,
} from './sentry-filter';

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

    expect(filterSentryEvent(event, hint)).toEqual(event);
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

    expect(filterSentryEvent(event, { originalException: error })).toEqual(
      event,
    );
  });

  it('KOBIS HTTP breadcrumb의 key만 제거하고 진단 정보는 유지해야 한다', () => {
    const breadcrumb: Breadcrumb = {
      category: 'http',
      data: {
        url: 'https://www.kobis.or.kr/list?key=kobis-test-secret&targetDt=20260902',
        'http.query': '?key=kobis-test-secret&targetDt=20260902',
        'http.method': 'GET',
        status_code: 200,
      },
      type: 'http',
    };

    expect(sanitizeSentryBreadcrumb(breadcrumb)).toEqual({
      ...breadcrumb,
      data: {
        url: 'https://www.kobis.or.kr/list?key=[REDACTED]&targetDt=20260902',
        'http.query': '?key=[REDACTED]&targetDt=20260902',
        'http.method': 'GET',
        status_code: 200,
      },
    });
    expect(JSON.stringify(breadcrumb)).toContain('kobis-test-secret');
  });

  it('오류 event의 query와 TMDB Authorization 정보를 함께 제거해야 한다', () => {
    const event: Event = {
      breadcrumbs: [
        {
          category: 'http',
          data: {
            'http.query': '?api_key=tmdb-query-secret&language=ko-KR&region=KR',
          },
        },
      ],
      extra: {
        axios: {
          headers: {
            Authorization: 'Bearer tmdb-header-secret',
            'proxy-authorization': 'Bearer proxy-header-secret',
            Cookie: 'session=cookie-secret',
            'Set-Cookie': 'refresh=set-cookie-secret',
            Accept: 'application/json',
          },
          params: {
            key: 'kobis-param-secret',
            targetDt: '20260902',
          },
        },
      },
    };

    const sanitized = filterSentryEvent(event, {});
    const payload = JSON.stringify(sanitized);

    expect(payload).not.toContain('tmdb-query-secret');
    expect(payload).not.toContain('tmdb-header-secret');
    expect(payload).not.toContain('proxy-header-secret');
    expect(payload).not.toContain('cookie-secret');
    expect(payload).not.toContain('set-cookie-secret');
    expect(payload).not.toContain('kobis-param-secret');
    expect(payload).toContain('api_key=[REDACTED]');
    expect(payload).toContain('"Authorization":"[REDACTED]"');
    expect(payload).toContain('"key":"[REDACTED]"');
    expect(payload).toContain('"targetDt":"20260902"');
    expect(payload).toContain('"Accept":"application/json"');
  });

  it('공식 request query tuple과 cookies 구조를 정제해야 한다', () => {
    const event: Event = {
      request: {
        query_string: [
          ['key', 'kobis-tuple-secret'],
          ['targetDt', '20260902'],
        ],
        cookies: {
          session: 'session-cookie-secret',
          preference: 'preference-cookie-secret',
        },
      },
    };

    const sanitized = filterSentryEvent(event, {});
    const payload = JSON.stringify(sanitized);

    expect(payload).not.toContain('kobis-tuple-secret');
    expect(payload).not.toContain('session-cookie-secret');
    expect(payload).not.toContain('preference-cookie-secret');
    expect(sanitized?.request?.query_string).toEqual([
      ['key', '[REDACTED]'],
      ['targetDt', '20260902'],
    ]);
    expect(sanitized?.request?.cookies).toEqual({
      session: '[REDACTED]',
      preference: '[REDACTED]',
    });
  });

  it('지원하는 민감 query parameter 이름을 모두 정제해야 한다', () => {
    const breadcrumb: Breadcrumb = {
      category: 'http',
      data: {
        'http.query':
          '?key=key-secret&api_key=api-key-secret&apikey=apikey-secret&token=token-secret&access_token=access-token-secret&auth=auth-secret&authorization=authorization-secret&targetDt=20260902',
      },
    };

    const sanitized = sanitizeSentryBreadcrumb(breadcrumb);
    const payload = JSON.stringify(sanitized);

    for (const secret of [
      'key-secret',
      'api-key-secret',
      'apikey-secret',
      'token-secret',
      'access-token-secret',
      'auth-secret',
      'authorization-secret',
    ]) {
      expect(payload).not.toContain(secret);
    }
    expect(payload.match(/\[REDACTED\]/g)).toHaveLength(7);
    expect(payload).toContain('targetDt=20260902');
  });

  it('transaction event의 breadcrumb와 span 비밀값을 제거해야 한다', () => {
    const event: TransactionEvent = {
      type: 'transaction',
      transaction: 'GET /api/rankings',
      breadcrumbs: [
        {
          category: 'http',
          data: {
            url: 'https://www.kobis.or.kr/list?key=kobis-breadcrumb-secret&targetDt=20260902',
          },
        },
      ],
      spans: [
        {
          data: {
            'http.query': '?key=kobis-span-secret&targetDt=20260902',
            'http.method': 'GET',
          },
          span_id: '0123456789abcdef',
          start_timestamp: 1,
          trace_id: '0123456789abcdef0123456789abcdef',
        },
      ],
    };

    const sanitized = sanitizeSentryTransaction(event);
    const payload = JSON.stringify(sanitized);

    expect(payload).not.toContain('kobis-breadcrumb-secret');
    expect(payload).not.toContain('kobis-span-secret');
    expect(payload).toContain('targetDt=20260902');
    expect(payload).toContain('"http.method":"GET"');
  });

  it('standalone span의 query와 flattened Authorization 값을 제거해야 한다', () => {
    const span: SpanJSON = {
      data: {
        'http.query': '?token=span-query-secret&language=ko-KR',
        'http.request.header.authorization': 'Bearer tmdb-span-secret',
        'http.method': 'GET',
      },
      span_id: '0123456789abcdef',
      start_timestamp: 1,
      trace_id: '0123456789abcdef0123456789abcdef',
    };

    const sanitized = sanitizeSentrySpan(span);
    const payload = JSON.stringify(sanitized);

    expect(payload).not.toContain('span-query-secret');
    expect(payload).not.toContain('tmdb-span-secret');
    expect(sanitized.data['http.query']).toBe(
      '?token=[REDACTED]&language=ko-KR',
    );
    expect(sanitized.data['http.request.header.authorization']).toBe(
      '[REDACTED]',
    );
    expect(sanitized.data['http.method']).toBe('GET');
  });
});
