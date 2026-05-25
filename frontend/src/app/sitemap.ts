import type { MetadataRoute } from 'next';

const SITE_URL = 'https://filmott.kr';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface SitemapContent {
  tmdbId: number;
  contentType: string;
  lastModified?: string;
  updatedAt?: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/discover`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];

  let contentPages: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_BASE}/contents/sitemap`, {
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const contents: SitemapContent[] = await res.json();
      const maxContent = 50000 - staticPages.length;

      contentPages = contents.slice(0, maxContent).map((c) => {
        const modified = c.lastModified ?? c.updatedAt;

        return {
          url: `${SITE_URL}/contents/${c.contentType}/${c.tmdbId}`,
          lastModified: modified ? new Date(modified) : undefined,
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        };
      });
    }
  } catch {
    // sitemap 생성 실패 시 정적 페이지만 반환
  }

  return [...staticPages, ...contentPages];
}
