import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { GET } from '@/app/google-sitemaps/[cohort]/route';
import { apiUrl } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';

function request(cohort: string): Promise<Response> {
  return GET(new Request(`http://localhost/google-sitemaps/${cohort}`), {
    params: Promise.resolve({ cohort }),
  });
}

describe('Google 관찰 sitemap', () => {
  it('허용된 cohort를 표준 sitemap XML로 반환해야 한다', async () => {
    server.use(
      http.get(
        apiUrl('/contents/sitemap/google/filmott-signal'),
        () =>
          HttpResponse.json([
            {
              tmdbId: 123,
              contentType: 'movie',
              lastModified: '2026-09-03T00:00:00.000Z',
            },
            {
              tmdbId: 456,
              contentType: 'tv',
              lastModified: '2026-09-02T00:00:00.000Z',
            },
          ]),
      ),
    );

    const response = await request('filmott-signal.xml');
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/xml; charset=utf-8',
    );
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain(
      '<loc>https://filmott.kr/contents/movie/123</loc>',
    );
    expect(xml).toContain('<lastmod>2026-09-03T00:00:00.000Z</lastmod>');
    expect(xml).toContain('<loc>https://filmott.kr/contents/tv/456</loc>');
  });

  it.each([
    ['provider-high.xml', 'provider-high'],
    ['provider-mid.xml', 'provider-mid'],
  ])('%s 요청을 backend %s cohort로 전달해야 한다', async (path, cohort) => {
    let called = false;
    server.use(
      http.get(apiUrl(`/contents/sitemap/google/${cohort}`), () => {
        called = true;
        return HttpResponse.json([]);
      }),
    );

    const response = await request(path);

    expect(response.status).toBe(200);
    expect(called).toBe(true);
  });

  it('알 수 없는 cohort는 backend를 호출하지 않고 400을 반환해야 한다', async () => {
    const response = await request('unknown.xml');

    expect(response.status).toBe(400);
  });

  it('backend 오류를 성공한 빈 sitemap으로 바꾸지 않아야 한다', async () => {
    server.use(
      http.get(apiUrl('/contents/sitemap/google/provider-high'), () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    const response = await request('provider-high.xml');

    expect(response.status).toBe(502);
  });

  it('잘못된 backend 항목이 있으면 부분 sitemap 대신 502를 반환해야 한다', async () => {
    server.use(
      http.get(apiUrl('/contents/sitemap/google/provider-mid'), () =>
        HttpResponse.json([
          {
            tmdbId: 0,
            contentType: 'movie',
            lastModified: 'invalid-date',
          },
        ]),
      ),
    );

    const response = await request('provider-mid.xml');

    expect(response.status).toBe(502);
  });
});
