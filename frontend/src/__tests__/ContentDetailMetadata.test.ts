import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/fetcher', () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from '@/lib/fetcher';
import { generateMetadata } from '@/app/contents/[type]/[tmdbId]/page';

const mockFetchApi = vi.mocked(fetchApi);

describe('ContentDetail generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adult=false인 콘텐츠는 robots 필드가 없어야 한다', async () => {
    mockFetchApi.mockResolvedValue({
      id: 1,
      tmdbId: 550,
      contentType: 'movie',
      title: '파이트 클럽',
      originalTitle: 'Fight Club',
      overview: '첫 번째 규칙: 파이트 클럽에 대해 이야기하지 않는다.',
      posterUrl: null,
      backdropUrl: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
      releaseDate: '1999-10-15',
      voteAverage: 8.4,
      genres: [{ id: 18, name: '드라마' }],
      runtime: 139,
      adult: false,
      credits: [],
      watchProviders: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const params = Promise.resolve({ type: 'movie', tmdbId: '550' });
    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe('파이트 클럽');
    expect(metadata.robots).toBeUndefined();
  });

  it('adult=true인 콘텐츠는 noindex, nofollow 메타태그가 있어야 한다', async () => {
    mockFetchApi.mockResolvedValue({
      id: 2,
      tmdbId: 999,
      contentType: 'movie',
      title: '성인 콘텐츠',
      originalTitle: 'Adult Content',
      overview: '테스트용 성인 콘텐츠입니다.',
      posterUrl: null,
      backdropUrl: null,
      releaseDate: '2026-01-01',
      voteAverage: 5.0,
      genres: [],
      runtime: 90,
      adult: true,
      credits: [],
      watchProviders: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const params = Promise.resolve({ type: 'movie', tmdbId: '999' });
    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe('성인 콘텐츠');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('fetchApi 실패 시 기본 메타데이터를 반환해야 한다', async () => {
    mockFetchApi.mockRejectedValue(new Error('API error'));

    const params = Promise.resolve({ type: 'movie', tmdbId: '0' });
    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe('작품 상세');
    expect(metadata.robots).toBeUndefined();
  });
});
