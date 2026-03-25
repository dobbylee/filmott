import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          {/* 왼쪽: 로고 + 정책 링크 */}
          <div className="space-y-2">
            <Link
              href="/"
              className="text-2xl font-black tracking-tight text-white hover-glow transition-all duration-300"
              style={{ letterSpacing: '-0.05em' }}
            >
              film<span className="text-gradient">ott</span>
            </Link>
            <p className="text-sm text-white/40">AI가 취향에 맞는 영화/시리즈를 추천해 드립니다</p>
          </div>

          {/* 오른쪽: 정책 링크 + 연락처 */}
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end">
            <nav className="flex gap-2">
              <Link href="/privacy" className="hover:text-primary transition-colors">
                개인정보처리방침
              </Link>
              <span className="text-white/10">|</span>
              <Link href="/terms" className="hover:text-primary transition-colors">
                이용약관
              </Link>
            </nav>
            <span>filmottkr@gmail.com</span>
          </div>
        </div>

        {/* 하단: 출처 + 저작권 (가운데 정렬) */}
        <div className="mt-4 text-center text-xs text-muted-foreground space-y-1">
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
      </div>
    </footer>
  );
}
