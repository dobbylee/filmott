import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  ...(process.env.FILMOTT_HARNESS_ROOT
    ? {
        turbopack: { root: process.env.FILMOTT_HARNESS_ROOT },
        outputFileTracingRoot: process.env.FILMOTT_HARNESS_ROOT,
      }
    : {}),
  output: 'standalone',
  cacheMaxMemorySize: 256 * 1024 * 1024,
  experimental: {
    isrFlushToDisk: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    disable: true,
  },
});
