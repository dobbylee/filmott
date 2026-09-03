const SITE_URL = 'https://filmott.kr';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const dynamic = 'force-dynamic';

const GOOGLE_SITEMAP_COHORTS = {
  'filmott-signal.xml': 'filmott-signal',
  'provider-high.xml': 'provider-high',
  'provider-mid.xml': 'provider-mid',
} as const;

interface SitemapContent {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  lastModified: string;
}

function parseSitemapContents(value: unknown): SitemapContent[] | null {
  if (!Array.isArray(value)) return null;

  const contents: SitemapContent[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;

    const tmdbId = 'tmdbId' in item ? item.tmdbId : undefined;
    const contentType =
      'contentType' in item ? item.contentType : undefined;
    const lastModified =
      'lastModified' in item ? item.lastModified : undefined;
    if (
      typeof tmdbId !== 'number' ||
      !Number.isSafeInteger(tmdbId) ||
      tmdbId <= 0 ||
      (contentType !== 'movie' && contentType !== 'tv') ||
      typeof lastModified !== 'string' ||
      !Number.isFinite(Date.parse(lastModified))
    ) {
      return null;
    }

    contents.push({ tmdbId, contentType, lastModified });
  }

  return contents;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildSitemapXml(contents: SitemapContent[]): string {
  const urls = contents
    .map((content) => {
      const url = `${SITE_URL}/contents/${content.contentType}/${content.tmdbId}`;
      const lastModified = new Date(content.lastModified).toISOString();

      return [
        '<url>',
        `<loc>${escapeXml(url)}</loc>`,
        `<lastmod>${escapeXml(lastModified)}</lastmod>`,
        '</url>',
      ].join('');
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cohort: string }> },
): Promise<Response> {
  const { cohort } = await params;
  const backendCohort =
    GOOGLE_SITEMAP_COHORTS[
      cohort as keyof typeof GOOGLE_SITEMAP_COHORTS
    ];
  if (!backendCohort) {
    return new Response('지원하지 않는 Google sitemap cohort입니다.', {
      status: 400,
    });
  }

  try {
    const response = await fetch(
      `${API_BASE}/contents/sitemap/google/${backendCohort}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      return new Response('Google sitemap 데이터를 불러오지 못했습니다.', {
        status: 502,
      });
    }

    const contents = parseSitemapContents((await response.json()) as unknown);
    if (!contents) {
      return new Response('Google sitemap 데이터 형식이 올바르지 않습니다.', {
        status: 502,
      });
    }

    return new Response(buildSitemapXml(contents), {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  } catch {
    return new Response('Google sitemap 데이터를 불러오지 못했습니다.', {
      status: 502,
    });
  }
}
