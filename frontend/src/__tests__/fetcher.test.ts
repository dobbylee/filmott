import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchApi } from '@/lib/fetcher';

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

  it('API 에러 시 예외를 던진다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchApi('/contents/movie/999999')).rejects.toThrow(
      'API error: 404 Not Found',
    );
  });
});
