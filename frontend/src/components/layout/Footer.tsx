import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div
        data-testid="footer-content"
        className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:min-h-[124px] sm:flex-row sm:items-center sm:justify-between"
      >
        {/* 왼쪽: 출처 + 저작권 */}
        <div
          data-testid="footer-source-content"
          className="text-center text-xs text-muted-foreground space-y-1 sm:text-left"
        >
          <p>
            본 서비스는{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">TMDB</a>
            {' '}및{' '}
            <a href="https://www.kobis.or.kr" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">KOBIS</a>
            {' '}데이터를 활용합니다.
          </p>
          <p className="text-sm">
            &copy; {new Date().getFullYear()} filmott. All rights reserved.
          </p>
        </div>

        {/* 오른쪽: 연락처 + 정책 링크 */}
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground sm:items-end">
          <a href="mailto:filmottkr@gmail.com" className="hover:text-primary transition-colors">filmottkr@gmail.com</a>
          <nav className="flex gap-2">
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
    </footer>
  );
}
