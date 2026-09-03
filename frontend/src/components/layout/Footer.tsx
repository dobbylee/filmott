import Link from 'next/link';
import { Film, Tv } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4">
        {/* 모바일: 핵심 링크만 압축 표시 */}
        <div
          data-testid="footer-mobile-content"
          className="space-y-4 py-6 text-center sm:hidden"
        >
          <nav
            data-testid="footer-mobile-discovery"
            className="grid grid-cols-2 gap-3"
          >
            <Link
              href="/discover?type=movie"
              className="flex items-center justify-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-base font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Film className="h-5 w-5" aria-hidden="true" />
              영화
            </Link>
            <Link
              href="/discover?type=tv"
              className="flex items-center justify-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-base font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Tv className="h-5 w-5" aria-hidden="true" />
              시리즈
            </Link>
          </nav>

          <nav
            data-testid="footer-mobile-policy"
            className="grid grid-cols-2 border-t border-white/5 pt-4 text-base text-muted-foreground"
          >
            <Link
              href="/privacy"
              className="border-r border-white/10 px-2 text-center hover:text-primary transition-colors"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/terms"
              className="px-2 text-center hover:text-primary transition-colors"
            >
              이용약관
            </Link>
          </nav>
        </div>

        {/* 데스크톱: 3열 정보 구조 */}
        <div
          data-testid="footer-content"
          className="hidden gap-8 py-5 text-left sm:grid sm:grid-cols-3 sm:items-center"
        >
          {/* 왼쪽: 로고 */}
          <div
            data-testid="footer-left-content"
            className="flex items-center sm:items-start"
          >
            <Link
              href="/"
              className="text-3xl font-black tracking-tight text-white hover-glow transition-all duration-300"
              style={{ letterSpacing: '-0.05em' }}
            >
              film<span className="text-gradient">ott</span>
            </Link>

          </div>

          {/* 중앙: 탐색 */}
          <div className="sm:text-center">
            <nav
              data-testid="footer-discovery-links"
              className="flex items-center justify-center gap-2 text-lg text-muted-foreground"
            >
              <Link
                href="/discover?type=movie"
                className="hover:text-primary transition-colors"
              >
                영화
              </Link>
              <span
                data-testid="footer-discovery-separator"
                className="text-white/10"
              >
                |
              </span>
              <Link
                href="/discover?type=tv"
                className="hover:text-primary transition-colors"
              >
                시리즈
              </Link>
            </nav>
          </div>

          {/* 오른쪽: 연락처 + 정책 */}
          <div
            data-testid="footer-desktop-contact"
            className="flex flex-col items-center gap-2 text-sm text-muted-foreground sm:items-end sm:text-right"
          >
            <a
              href="mailto:filmottkr@gmail.com"
              data-testid="footer-email"
              className="hover:text-primary transition-colors"
            >
              filmottkr@gmail.com
            </a>
            <nav
              data-testid="footer-desktop-policy"
              className="flex items-center gap-2"
            >
              <Link href="/privacy" className="hover:text-primary transition-colors">
                개인정보처리방침
              </Link>
              <span className="text-white/10">|</span>
              <Link href="/terms" className="hover:text-primary transition-colors">
                이용약관
              </Link>
            </nav>
          </div>
        </div>

        {/* 최하단: 출처 + 저작권 */}
        <div
          data-testid="footer-legal"
          className="border-t border-white/5 py-4 text-center text-sm text-muted-foreground"
        >
          <p data-testid="footer-source-content" className="mb-1">
            본 서비스는{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">TMDB</a>
            {' '}및{' '}
            <a href="https://www.kobis.or.kr" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">KOBIS</a>
            {' '}데이터를 활용합니다.
          </p>
          <p>&copy; {new Date().getFullYear()} filmott. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
