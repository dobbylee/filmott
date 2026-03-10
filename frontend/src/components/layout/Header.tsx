'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search, User, LogOut, Compass, Film, Tv, Home, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ui/ThemeToggle';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-xl font-bold text-indigo-600 dark:text-indigo-400"
        >
          Board
        </Link>

        <form
          onSubmit={handleSearch}
          className="hidden md:flex items-center flex-1 max-w-md mx-8"
        >
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="작품을 검색해보세요..."
              className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-gray-400"
            />
          </div>
        </form>

        <div className="flex items-center gap-1 sm:gap-3">
          {/* 데스크톱 네비게이션 */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/"
              className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Home className="h-4 w-4" />
              <span>홈</span>
            </Link>
            <Link
              href="/discover?type=movie"
              className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Film className="h-4 w-4" />
              <span>영화</span>
            </Link>
            <Link
              href="/discover?type=tv"
              className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Tv className="h-4 w-4" />
              <span>TV</span>
            </Link>
            <Link
              href="/discover"
              className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Compass className="h-4 w-4" />
              <span>탐색</span>
            </Link>
          </nav>

          {/* 모바일 메뉴 토글 */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800 md:hidden"
            aria-label="메뉴"
          >
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <ThemeToggle />

          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">{user.nickname}</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <Link
                    href="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-700"
                  >
                    프로필 설정
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-slate-700"
                  >
                    <LogOut className="w-4 h-4" />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              로그인
            </Link>
          )}
        </div>
      </div>

      {/* 모바일 네비게이션 */}
      {showMobileMenu && (
        <nav className="border-t border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 md:hidden">
          <div className="flex flex-col gap-1">
            <Link
              href="/"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Home className="h-4 w-4" />
              홈
            </Link>
            <Link
              href="/discover?type=movie"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Film className="h-4 w-4" />
              영화
            </Link>
            <Link
              href="/discover?type=tv"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Tv className="h-4 w-4" />
              TV
            </Link>
            <Link
              href="/discover"
              onClick={() => setShowMobileMenu(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Compass className="h-4 w-4" />
              탐색
            </Link>
            {/* 모바일 검색 */}
            <form
              onSubmit={(e) => {
                handleSearch(e);
                setShowMobileMenu(false);
              }}
              className="mt-2 flex items-center"
            >
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="작품을 검색해보세요..."
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-gray-400"
                />
              </div>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
