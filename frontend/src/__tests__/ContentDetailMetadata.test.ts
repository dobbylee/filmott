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

  it('searchIndexable이 없는 기존 비성인 API 응답은 index 동작을 유지해야 한다', async () => {
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
      searchIndexable: true,
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

  it('검색 가치 기준을 만족하지 못한 비성인 작품은 noindex, follow여야 한다', async () => {
    mockFetchApi.mockResolvedValue({
      id: 3,
      tmdbId: 1000,
      contentType: 'movie',
      title: '어느 영화',
      overview: '줄거리가 있지만 검색 가치 기준은 부족합니다.',
      genres: [],
      adult: false,
      searchIndexable: false,
      credits: [],
      watchProviders: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const params = Promise.resolve({ type: 'movie', tmdbId: '1000' });
    const metadata = await generateMetadata({ params });

    expect(metadata.robots).toEqual({
      index: false,
      follow: true,
      googleBot: { index: false, follow: false },
    });
  });

  it('줄거리가 공백이면 안정적인 한국어 description을 사용해야 한다', async () => {
    mockFetchApi.mockResolvedValue({
      id: 4,
      tmdbId: 1001,
      contentType: 'tv',
      title: '빈 줄거리 작품',
      overview: '   ',
      genres: [],
      adult: false,
      searchIndexable: true,
      credits: [],
      watchProviders: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const params = Promise.resolve({ type: 'tv', tmdbId: '1001' });
    const metadata = await generateMetadata({ params });

    expect(metadata.description).toBe('빈 줄거리 작품 상세 정보');
    expect(metadata.openGraph?.description).toBe(
      '빈 줄거리 작품 상세 정보',
    );
    expect(metadata.twitter?.description).toBe(
      '빈 줄거리 작품 상세 정보',
    );
    expect(metadata.robots).toBeUndefined();
  });

  it('경로형 백드롭을 Open Graph와 Twitter의 CDN 절대 URL로 변환해야 한다', async () => {
    mockFetchApi.mockResolvedValue({
      id: 5,
      tmdbId: 1002,
      contentType: 'movie',
      title: '상대 이미지 작품',
      overview: '상대 경로 이미지 정규화 테스트입니다.',
      backdropUrl: '/backdrop.jpg',
      genres: [],
      adult: false,
      searchIndexable: true,
      credits: [],
      watchProviders: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const params = Promise.resolve({ type: 'movie', tmdbId: '1002' });
    const metadata = await generateMetadata({ params });

    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
        width: 1280,
        height: 720,
        alt: '상대 이미지 작품',
      },
    ]);
    expect(metadata.twitter?.images).toEqual([
      'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
    ]);
  });

  it('fetchApi 실패 시 기본 메타데이터를 반환해야 한다', async () => {
    mockFetchApi.mockRejectedValue(new Error('API error'));

    const params = Promise.resolve({ type: 'movie', tmdbId: '0' });
    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe('작품 상세');
    expect(metadata.robots).toBeUndefined();
  });
});
