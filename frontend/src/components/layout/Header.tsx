'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Search, LogOut, Compass, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 헤더 스크롤 배경 변경
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showUserMenu]);

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
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-black/80 backdrop-blur-lg border-b border-white/5 py-3' 
          : 'bg-transparent border-transparent py-5'
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl px-4 items-center justify-between">
        <Link
          href="/"
          className="text-2xl font-black tracking-tight text-white hover-glow transition-all duration-300"
          style={{ letterSpacing: '-0.05em' }}
        >
          film<span className="text-gradient">ott</span>
        </Link>

        {/* 데스크톱 네비게이션 & 검색창 */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-10">
          <nav className="flex items-center gap-6">
            <Link href="/discover?type=movie" className="text-[15px] font-medium text-white/70 hover:text-white transition-colors">영화</Link>
            <Link href="/discover?type=tv" className="text-[15px] font-medium text-white/70 hover:text-white transition-colors">TV</Link>
          </nav>
          
          <form onSubmit={handleSearch} className="relative w-64 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white/80 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder=""
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-sm text-white placeholder-white/40 outline-none focus:border-white/30 focus:bg-white/10 transition-all"
            />
          </form>
        </div>

        <div className="flex items-center gap-3">
          {/* 모바일 메뉴 토글 */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="md:hidden rounded-full p-2 text-white/80 hover:bg-white/10"
            aria-label="메뉴"
          >
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-fuchsia-600 to-blue-500 text-xs">
                  {user.nickname.charAt(0)}
                </div>
                <span className="hidden sm:inline">{user.nickname}</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-[#111] py-1 shadow-2xl overflow-hidden glass-panel">
                  <Link
                    href="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex w-full items-center px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    프로필 설정
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
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
              className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
            >
              로그인
            </Link>
          )}
        </div>
      </div>

      {/* 모바일 네비게이션 */}
      {showMobileMenu && (
        <nav className="absolute top-full left-0 right-0 border-b border-white/10 bg-[#050505]/95 backdrop-blur-xl px-4 py-4 md:hidden shadow-2xl">
          <div className="flex flex-col gap-2">
            <Link href="/discover?type=movie" onClick={() => setShowMobileMenu(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-white/80 hover:bg-white/10 hover:text-white">
              <Compass className="h-5 w-5" /> 영화
            </Link>
            <Link href="/discover?type=tv" onClick={() => setShowMobileMenu(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-white/80 hover:bg-white/10 hover:text-white">
              <Compass className="h-5 w-5" /> TV
            </Link>
            
            <form onSubmit={(e) => { handleSearch(e); setShowMobileMenu(false); }} className="mt-2 px-2">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder=""
                  className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder-white/40 outline-none focus:border-white/30"
                />
              </div>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
