import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          {/* 왼쪽: 로고 + 태그라인 */}
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

          {/* 오른쪽: 커뮤니티 + 연락처 + 정책 링크 */}
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end">
            <a
              href="https://open.kakao.com/o/gF5pAlli"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-white/40 hover:text-yellow-400 transition-colors [&>svg]:text-yellow-400"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.72 1.8 5.108 4.513 6.467-.197.735-.714 2.666-.818 3.08-.128.508.186.501.39.365.161-.107 2.553-1.737 3.583-2.442.767.107 1.554.164 2.332.164 5.523 0 10-3.463 10-7.634C22 6.463 17.523 3 12 3" />
              </svg>
              오픈채팅
            </a>
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
