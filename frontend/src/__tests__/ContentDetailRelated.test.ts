import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelatedContent } from '@/types/content';

vi.mock('@/lib/fetcher', () => ({
  fetchApi: vi.fn(),
  isApiError: vi.fn(),
}));

import { fetchApi } from '@/lib/fetcher';
import { fetchRelatedContents } from '@/app/contents/[type]/[tmdbId]/page';

const mockFetchApi = vi.mocked(fetchApi);

const items: RelatedContent[] = Array.from({ length: 7 }, (_, index) => ({
  tmdbId: index + 1,
  contentType: 'movie',
  title: `관련 작품 ${index + 1}`,
  posterUrl: `/poster-${index + 1}.jpg`,
  releaseDate: '2026-01-01',
  voteAverage: 8,
}));

describe('작품 상세 관련 작품 조회', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('서버 상세 페이지에서 limit=6으로 조회하고 최대 6개만 반환해야 한다', async () => {
    mockFetchApi.mockResolvedValue(items);

    const result = await fetchRelatedContents('movie', '550', true);

    expect(mockFetchApi).toHaveBeenCalledWith(
      '/contents/movie/550/related?limit=6',
      { next: { revalidate: 3600 } },
    );
    expect(result).toEqual(items.slice(0, 6));
  });

  it('관련 작품 API가 실패하면 상세 페이지를 유지하도록 빈 배열을 반환해야 한다', async () => {
    mockFetchApi.mockRejectedValue(new Error('API error'));

    await expect(fetchRelatedContents('tv', '1399', true)).resolves.toEqual([]);
  });

  it.each([false, undefined])(
    'searchIndexable=%s이면 비용이 드는 관련 작품 API를 호출하지 않아야 한다',
    async (searchIndexable) => {
      await expect(
        fetchRelatedContents('movie', '550', searchIndexable),
      ).resolves.toEqual([]);
      expect(mockFetchApi).not.toHaveBeenCalled();
    },
  );
});
