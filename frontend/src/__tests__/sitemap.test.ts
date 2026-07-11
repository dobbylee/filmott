import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import sitemap from '@/app/sitemap';
import { apiUrl } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';

describe('sitemap', () => {
  function respondWith(body: unknown, status = 200): void {
    server.use(
      http.get(apiUrl('/contents/sitemap'), () =>
        HttpResponse.json(body, { status }),
      ),
    );
  }

  it('정적 페이지 4개를 항상 포함해야 한다', async () => {
    respondWith([]);

    const result = await sitemap();

    const urls = result.map((entry) => entry.url);
    expect(urls).toContain('https://filmott.kr');
    expect(urls).toContain('https://filmott.kr/discover');
    expect(urls).toContain('https://filmott.kr/privacy');
    expect(urls).toContain('https://filmott.kr/terms');
  });

  it('메인 페이지의 priority가 1.0이어야 한다', async () => {
    respondWith([]);

    const result = await sitemap();

    const mainPage = result.find((entry) => entry.url === 'https://filmott.kr');
    expect(mainPage?.priority).toBe(1.0);
    expect(mainPage?.changeFrequency).toBe('daily');
  });

  it('API에서 콘텐츠를 가져와 동적 페이지를 포함해야 한다', async () => {
    const mockContents = [
      { tmdbId: 123, contentType: 'movie', lastModified: '2026-03-15T00:00:00.000Z' },
      { tmdbId: 456, contentType: 'tv', lastModified: '2026-03-14T00:00:00.000Z' },
    ];
    respondWith(mockContents);

    const result = await sitemap();

    const urls = result.map((entry) => entry.url);
    expect(urls).toContain('https://filmott.kr/contents/movie/123');
    expect(urls).toContain('https://filmott.kr/contents/tv/456');
    expect(result.length).toBe(6); // 4 static + 2 dynamic
  });

  it('동적 콘텐츠 페이지의 priority가 0.7이어야 한다', async () => {
    const mockContents = [
      { tmdbId: 123, contentType: 'movie', lastModified: '2026-03-15T00:00:00.000Z' },
    ];
    respondWith(mockContents);

    const result = await sitemap();

    const contentPage = result.find((entry) => entry.url === 'https://filmott.kr/contents/movie/123');
    expect(contentPage?.priority).toBe(0.7);
    expect(contentPage?.changeFrequency).toBe('weekly');
    expect(contentPage?.lastModified).toEqual(new Date('2026-03-15T00:00:00.000Z'));
  });

  it('배포 순서 호환을 위해 기존 updatedAt 응답도 lastModified로 사용해야 한다', async () => {
    const mockContents = [
      { tmdbId: 123, contentType: 'movie', updatedAt: '2026-03-13T00:00:00.000Z' },
    ];
    respondWith(mockContents);

    const result = await sitemap();

    const contentPage = result.find((entry) => entry.url === 'https://filmott.kr/contents/movie/123');
    expect(contentPage?.lastModified).toEqual(new Date('2026-03-13T00:00:00.000Z'));
  });

  it('API 호출 실패 시 정적 페이지만 반환해야 한다', async () => {
    server.use(
      http.get(apiUrl('/contents/sitemap'), () => HttpResponse.error()),
    );

    const result = await sitemap();

    expect(result.length).toBe(4);
    const urls = result.map((entry) => entry.url);
    expect(urls).toContain('https://filmott.kr');
    expect(urls).toContain('https://filmott.kr/discover');
  });

  it('API가 ok: false를 반환하면 정적 페이지만 반환해야 한다', async () => {
    respondWith({}, 500);

    const result = await sitemap();

    expect(result.length).toBe(4);
  });
});
