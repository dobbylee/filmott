import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-white/10 bg-[#050505]">
      <div className="mx-auto max-w-7xl px-4 py-10">
        {/* 3컬럼 그리드 — 모바일 1컬럼 */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {/* 왼쪽: 로고 + 소개 */}
          <div>
            <Link
              href="/"
              className="text-xl font-black tracking-tight text-white hover-glow transition-all duration-300"
              style={{ fontFamily: 'var(--font-outfit)', letterSpacing: '-0.05em' }}
            >
              film<span className="text-gradient">ott</span>
            </Link>
            <p className="mt-2 text-sm leading-relaxed text-white/40">
              영화와 드라마를 기록하고 공유하는 공간.
            </p>
          </div>

          {/* 가운데: 탐색 링크 */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/60">
              탐색
            </h3>
            <nav className="mt-3 flex flex-col gap-2">
              <Link
                href="/discover?type=movie"
                className="text-sm text-white/40 hover:text-white transition-colors"
              >
                영화
              </Link>
              <Link
                href="/discover?type=tv"
                className="text-sm text-white/40 hover:text-white transition-colors"
              >
                시리즈
              </Link>
              <Link
                href="/discover"
                className="text-sm text-white/40 hover:text-white transition-colors"
              >
                전체 탐색
              </Link>
            </nav>
          </div>

          {/* 오른쪽: 안내 링크 */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/60">
              안내
            </h3>
            <nav className="mt-3 flex flex-col gap-2">
              <Link
                href="/privacy"
                className="text-sm text-white/40 hover:text-white transition-colors"
              >
                개인정보처리방침
              </Link>
              <Link
                href="/terms"
                className="text-sm text-white/40 hover:text-white transition-colors"
              >
                이용약관
              </Link>
            </nav>
          </div>
        </div>

        {/* 하단: 저작권 + 출처 */}
        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs leading-relaxed text-white/30">
          <p>&copy; {new Date().getFullYear()} filmott. All rights reserved.</p>
          <p className="mt-1">
            본 서비스는{' '}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white/50 transition-colors"
            >
              TMDB
            </a>
            {' '}및{' '}
            <a
              href="https://www.kobis.or.kr/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white/50 transition-colors"
            >
              KOBIS
            </a>
            {' '}데이터를 활용합니다.
          </p>
        </div>
      </div>
    </footer>
  );
}
