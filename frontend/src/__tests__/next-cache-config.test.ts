vi.mock('@sentry/nextjs/config', () => ({
  withSentryConfig: <T>(config: T) => config,
}));

import nextConfig from '../../next.config';

describe('Next.js 서버 캐시 설정', () => {
  it('런타임 디스크 기록을 끄고 메모리 캐시를 256MB로 제한해야 한다', () => {
    expect(nextConfig.cacheMaxMemorySize).toBe(256 * 1024 * 1024);
    expect(nextConfig.experimental?.isrFlushToDisk).toBe(false);
  });
});
