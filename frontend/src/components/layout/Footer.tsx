import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div>
            <Link
              href="/"
              className="text-lg font-bold text-primary"
            >
              Board
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              영화, 드라마 한줄평과 별점을 남기고 공유하세요.
            </p>
          </div>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary transition-colors">
              홈
            </Link>
            <Link href="/discover?type=movie" className="hover:text-primary transition-colors">
              영화
            </Link>
            <Link href="/discover?type=tv" className="hover:text-primary transition-colors">
              TV
            </Link>
            <Link href="/discover" className="hover:text-primary transition-colors">
              탐색
            </Link>
          </nav>
        </div>
        <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Board. TMDB API 기반 데이터 제공.
        </div>
      </div>
    </footer>
  );
}
