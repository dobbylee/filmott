'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Search, LogOut, Compass, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const { user, isLoading, logout, openAuthModal } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // 검색창 외부 클릭 시 닫기
  useEffect(() => {
    if (!isSearchOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isSearchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsSearchOpen(false);
    }
  };

  const openSearch = () => {
    setIsSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
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
      <div className="mx-auto flex w-full max-w-7xl px-4 items-center">
        {/* 왼쪽: 로고 */}
        <div className="flex-1">
          <Link
            href="/"
            className="text-3xl font-black tracking-tight text-white hover-glow transition-all duration-300"
            style={{ letterSpacing: '-0.05em' }}
          >
            film<span className="text-gradient">ott</span>
          </Link>
        </div>

        {/* 중앙: 네비게이션 */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/discover?type=movie" className="text-[15px] font-medium text-white/70 hover:text-white transition-colors">영화</Link>
          <Link href="/discover?type=tv" className="text-[15px] font-medium text-white/70 hover:text-white transition-colors">시리즈</Link>
        </nav>

        {/* 오른쪽: 검색창 + 유저 */}
        <div className="flex-1 flex items-center justify-end gap-5">
          {/* 데스크톱 검색 */}
          <div ref={searchRef} className="relative hidden md:flex items-center">
            <form
              onSubmit={handleSearch}
              className={`flex items-center overflow-hidden rounded-full border transition-all duration-300 ${
                isSearchOpen
                  ? 'w-56 border-white/30 bg-white/10'
                  : 'w-0 border-transparent'
              }`}
            >
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setIsSearchOpen(false), setSearchQuery(''))}
                className="w-full bg-transparent py-2 pl-4 pr-9 text-sm text-white outline-none placeholder-white/40"
                placeholder="작품 / 인물"
              />
            </form>
            <button
              onClick={isSearchOpen ? handleSearch : openSearch}
              aria-label="검색"
              className={`absolute right-0 flex items-center justify-center rounded-full p-2 text-white/60 hover:text-white transition-colors ${
                isSearchOpen ? 'hover:bg-white/10' : ''
              }`}
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
          {/* 모바일 메뉴 토글 */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="md:hidden rounded-full p-2 text-white/80 hover:bg-white/10"
            aria-label="메뉴"
          >
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {isLoading ? (
            <div className="h-8 w-20 rounded-full bg-white/5 animate-pulse" />
          ) : user ? (
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
            <button
              onClick={() => openAuthModal('login')}
              className="rounded-full bg-gradient-to-br from-fuchsia-600 to-indigo-600 px-4 py-1.5 text-sm font-bold text-white shadow-[0_0_15px_rgba(192,38,211,0.5)] hover:shadow-[0_0_25px_rgba(192,38,211,0.7)] transition-all duration-300"
            >
              로그인
            </button>
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
              <Compass className="h-5 w-5" /> 시리즈
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
