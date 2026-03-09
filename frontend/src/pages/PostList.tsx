import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, PenSquare, LogOut, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { timeAgo } from '../utils/timeAgo';

const LIMIT = 20;

interface PostItem {
  id: number;
  title: string;
  views: number;
  createdAt: string;
  author: {
    id: number;
    username: string;
  };
}

interface PaginatedPosts {
  data: PostItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Generate initials from username
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Hue from username for consistent avatar colors
const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
};

const PostList: React.FC = () => {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const prevDebouncedSearchRef = React.useRef(debouncedSearch);

  useEffect(() => {
    const searchChanged = prevDebouncedSearchRef.current !== debouncedSearch;
    prevDebouncedSearchRef.current = debouncedSearch;

    const page = searchChanged ? 1 : currentPage;
    if (searchChanged) {
      setCurrentPage(1);
    }

    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        const params: Record<string, string | number> = { page, limit: LIMIT };
        if (debouncedSearch) {
          params.search = debouncedSearch;
        }
        const response = await api.get<PaginatedPosts>('/posts', { params });
        const { data, total: t, totalPages: tp } = response.data;
        setPosts(data);
        setTotal(t);
        setTotalPages(tp);
      } catch (error) {
        console.error('Failed to fetch posts', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPosts();
  }, [currentPage, debouncedSearch]);

  const rangeStart = total === 0 ? 0 : (currentPage - 1) * LIMIT + 1;
  const rangeEnd = Math.min(currentPage * LIMIT, total);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <img src="/logo.png" alt="PostBoard Logo" className="w-10 h-10" />
            <span>PostBoard</span>
          </Link>
          <div className="flex items-center gap-3 relative">
            {isAuthenticated && user ? (
              <div
                className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
              >
                <div className="flex flex-col items-end mr-1 hidden sm:flex">
                  <span className="text-sm font-bold text-slate-800 leading-tight">{user.username}</span>
                  <span className="text-xs text-slate-500">회원</span>
                </div>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: getAvatarColor(user.username) }}
                >
                  {getInitials(user.username)}
                </div>

                {/* Dropdown Menu */}
                {showProfileMenu && (
                  <div className="absolute top-12 right-0 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-10 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-2 border-b border-slate-50 mb-1 sm:hidden">
                      <p className="text-sm font-bold text-slate-800 truncate">{user.username}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>
                    <Link
                      to="/profile"
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      프로필 수정
                    </Link>
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login">
                <button className="text-sm font-semibold text-blue-500 hover:text-blue-600 px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors">
                  로그인
                </button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title & Top Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">게시판</h1>
            <p className="text-slate-500 border-none">자유롭게 소통하고 지식을 나눠보세요.</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
            {/* Search Bar */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="게시글 검색..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>

            {isAuthenticated && (
              <Link to="/posts/new" className="shrink-0 flex-1 sm:flex-none">
                <button className="w-full flex justify-center items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm shadow-blue-500/20">
                  <PenSquare className="w-4 h-4" />
                  새 글 쓰기
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Filters & Count Row */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center bg-white p-1 rounded-full border border-slate-200 shadow-sm">
            <button className="px-4 py-1.5 text-sm font-semibold text-blue-600 bg-blue-50 rounded-full">전체 글</button>
            <button className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors">인기 글</button>
          </div>
          <div className="text-sm text-slate-500">
            <span className="font-bold text-slate-700">{rangeStart === 0 ? 0 : `${rangeStart}-${rangeEnd}`}</span>
            {' '}/ {' '}
            <span className="font-bold text-slate-700">{total}</span>개 게시글
          </div>
        </div>

        {/* Posts Table */}
        <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden border border-slate-100">
          {/* Table Header */}
          <div className="grid grid-cols-[60px_1fr_180px_120px_80px] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>No.</span>
            <span>제목</span>
            <span>작성자</span>
            <span>날짜</span>
            <span className="text-right">조회수</span>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="px-6 py-16 text-center text-slate-400 text-sm">게시글을 불러오는 중...</div>
          )}

          {/* Empty State */}
          {!isLoading && posts.length === 0 && (
            <div className="px-6 py-16 text-center text-slate-400 text-sm">
              게시글이 없습니다. 첫 번째 글을 작성해보세요!
            </div>
          )}

          {/* Rows */}
          {posts.map((post) => (
            <Link
              key={post.id}
              to={`/posts/${post.id}`}
              className="grid grid-cols-[60px_1fr_180px_120px_80px] gap-4 px-6 py-4 items-center border-b border-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer"
            >
              <span className="text-sm text-slate-400 font-medium">{post.id}</span>
              <span className="text-sm font-semibold text-slate-800 truncate">{post.title}</span>
              <div className="flex items-center gap-2.5">
                {post.author ? (
                  <>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: getAvatarColor(post.author.username) }}
                    >
                      {getInitials(post.author.username)}
                    </div>
                    <span className="text-sm text-slate-600 truncate">{post.author.username}</span>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-200 text-slate-400 text-xs font-bold shrink-0">
                      ?
                    </div>
                    <span className="text-sm text-slate-400 italic truncate">탈퇴한 사용자</span>
                  </>
                )}
              </div>
              <span className="text-sm text-slate-400">{timeAgo(post.createdAt)}</span>
              <div className="flex items-center justify-end gap-1.5 text-sm text-slate-400">
                <Eye className="w-4 h-4" />
                <span>{post.views}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 1}
              aria-label="이전"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              이전
            </button>

            <span className="px-4 py-2 text-sm text-slate-500">
              <span className="font-bold text-slate-700">{currentPage}</span>{' '}
              / <span className="font-bold text-slate-700">{totalPages}</span> 페이지
            </span>

            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage === totalPages}
              aria-label="다음"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              다음
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default PostList;
