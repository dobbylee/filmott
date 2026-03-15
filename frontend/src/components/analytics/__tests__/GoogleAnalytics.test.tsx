import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// next/script를 mock하여 렌더링된 props를 검증
vi.mock('next/script', () => ({
  default: ({ id, src, strategy, children }: {
    id?: string;
    src?: string;
    strategy?: string;
    children?: string;
  }) => (
    <script data-testid={id ?? 'script'} data-src={src} data-strategy={strategy}>
      {children}
    </script>
  ),
}));

describe('GoogleAnalytics', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it('NEXT_PUBLIC_GA_ID가 없으면 아무것도 렌더링하지 않는다', async () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    const { default: GoogleAnalytics } = await import(
      '@/components/analytics/GoogleAnalytics'
    );

    const { container } = render(<GoogleAnalytics />);
    expect(container.innerHTML).toBe('');
  });

  it('NEXT_PUBLIC_GA_ID가 있으면 gtag 스크립트를 렌더링한다', async () => {
    process.env.NEXT_PUBLIC_GA_ID = 'G-TESTID123';

    const { default: GoogleAnalytics } = await import(
      '@/components/analytics/GoogleAnalytics'
    );

    const { container } = render(<GoogleAnalytics />);

    const scripts = container.querySelectorAll('script');
    expect(scripts.length).toBe(2);

    // gtag.js 로더 스크립트
    const loaderScript = scripts[0];
    expect(loaderScript.getAttribute('data-src')).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-TESTID123'
    );
    expect(loaderScript.getAttribute('data-strategy')).toBe('afterInteractive');

    // gtag 초기화 스크립트
    const initScript = scripts[1];
    expect(initScript.getAttribute('data-testid')).toBe('google-analytics');
    expect(initScript.getAttribute('data-strategy')).toBe('afterInteractive');
    expect(initScript.textContent).toContain('window.dataLayer');
    expect(initScript.textContent).toContain('gtag(\'config\', \'G-TESTID123\')');
  });
});
