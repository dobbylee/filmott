import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import {
  sanitizeExternalApiError,
  SanitizedExternalApiError,
  summarizeExternalApiError,
} from './external-api-error.util';

describe('summarizeExternalApiError', () => {
  it('Axios 오류에서 민감한 header, params, query를 제외한 요약만 반환해야 한다', () => {
    const response: AxiosResponse = {
      data: { message: 'Unauthorized' },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {
        headers: new AxiosHeaders({
          Authorization: 'Bearer tmdb-secret-token',
        }),
        url: '/movie/popular?api_key=tmdb-query-key&language=ko-KR',
        params: { key: 'kobis-secret-key', targetDt: '20260429' },
      },
    };
    const error = new AxiosError(
      'Request failed with status code 401',
      'ERR_BAD_REQUEST',
      {
        headers: new AxiosHeaders({
          Authorization: 'Bearer tmdb-secret-token',
        }),
        url: '/movie/popular?api_key=tmdb-query-key&language=ko-KR',
        params: { key: 'kobis-secret-key', targetDt: '20260429' },
      },
      undefined,
      response,
    );

    const summary = summarizeExternalApiError('TMDB', error);
    const payload = JSON.stringify(summary);

    expect(summary).toEqual({
      service: 'TMDB',
      endpointPath: '/movie/popular',
      status: 401,
      statusText: 'Unauthorized',
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 401',
    });
    expect(payload).not.toContain('tmdb-secret-token');
    expect(payload).not.toContain('tmdb-query-key');
    expect(payload).not.toContain('kobis-secret-key');
    expect(payload).not.toContain('Authorization');
    expect(payload).not.toContain('api_key=');
  });

  it('일반 Error 메시지의 Bearer 토큰과 query key를 마스킹해야 한다', () => {
    const summary = summarizeExternalApiError(
      'KOBIS',
      new Error(
        'GET https://kobis.example.test/list?key=kobis-secret-key failed with Bearer access-token',
      ),
      '/list',
    );
    const payload = JSON.stringify(summary);

    expect(payload).not.toContain('kobis-secret-key');
    expect(payload).not.toContain('access-token');
    expect(summary.endpointPath).toBe('/list');
  });

  it('안전한 오류에는 원본 Axios 객체를 보관하지 않아야 한다', () => {
    const error = new AxiosError(
      'GET /list?key=kobis-secret-key failed',
      'ECONNABORTED',
      {
        headers: new AxiosHeaders({
          Authorization: 'Bearer kobis-auth-token',
        }),
        url: '/list?key=kobis-query-key',
        params: { key: 'kobis-param-key' },
      },
    );

    const sanitizedError = sanitizeExternalApiError('KOBIS', error, '/list');
    const payload = JSON.stringify(sanitizedError);

    expect(sanitizedError).toBeInstanceOf(SanitizedExternalApiError);
    expect(sanitizedError).not.toHaveProperty('cause');
    expect(sanitizedError).not.toHaveProperty('config');
    expect(sanitizedError).not.toHaveProperty('request');
    expect(sanitizedError).not.toHaveProperty('response');
    expect(payload).not.toContain('kobis-secret-key');
    expect(payload).not.toContain('kobis-auth-token');
    expect(payload).not.toContain('kobis-query-key');
    expect(payload).not.toContain('kobis-param-key');
    expect(payload).not.toContain('Authorization');
  });

  it('안전한 오류를 다시 요약해도 진단 필드를 유지해야 한다', () => {
    const sanitizedError = new SanitizedExternalApiError({
      service: 'KOBIS',
      endpointPath: '/boxoffice/searchDailyBoxOfficeList.json',
      status: 504,
      statusText: 'Gateway Timeout',
      code: 'ECONNABORTED',
      message: 'timeout of 15000ms exceeded',
    });

    expect(summarizeExternalApiError('KOBIS', sanitizedError)).toEqual({
      service: 'KOBIS',
      endpointPath: '/boxoffice/searchDailyBoxOfficeList.json',
      status: 504,
      statusText: 'Gateway Timeout',
      code: 'ECONNABORTED',
      message: 'timeout of 15000ms exceeded',
    });
  });
});
