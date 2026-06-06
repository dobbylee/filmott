import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, fetchApi, isApiError } from '@/lib/fetcher';

describe('fetchApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('성공 시 JSON 데이터를 반환한다', async () => {
    const mockData = { results: [], page: 1 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchApi('/contents/search?q=test');
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/contents/search?q=test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('에러 응답에 JSON body가 없으면 기본 메시지를 사용한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.reject(new Error('no body')),
    });

    await expect(fetchApi('/contents/movie/999999')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'API error: 404 Not Found',
      status: 404,
      statusText: 'Not Found',
    });
  });

  it('에러 응답에 JSON body.message가 있으면 해당 메시지를 사용한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ message: '잘못된 요청입니다.' }),
    });

    await expect(fetchApi('/reviews')).rejects.toThrow(
      '잘못된 요청입니다.',
    );
  });

  it('에러 응답 JSON body에 message가 없으면 기본 메시지를 사용한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({ error: 'something went wrong' }),
    });

    await expect(fetchApi('/reviews')).rejects.toThrow(
      'API error: 500 Internal Server Error',
    );
  });

  it('ApiError를 판별할 수 있어야 한다', () => {
    const error = new ApiError('찾을 수 없습니다.', 404, 'Not Found');

    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error('찾을 수 없습니다.'))).toBe(false);
  });
});
