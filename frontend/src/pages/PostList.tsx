import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, PenSquare, Layers, LogOut } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';

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

const timeAgo = (dateStr: string) => {
  // Convert UTC string from DB to Date object, then to KST
  const date = new Date(dateStr);
  const now = new Date();
  
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return '방금 전';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}일 전`;
  
  // Example result: '2023. 10. 25.'
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const PostList: React.FC = () => {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await api.get<PostItem[]>('/posts');
        setPosts(response.data);
      } catch (error) {
        console.error('Failed to fetch posts', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPosts();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Layers className="text-blue-500 w-7 h-7 fill-blue-500" />
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
                  <span className="text-xs text-slate-500">Member</span>
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
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login">
                <button className="text-sm font-semibold text-blue-500 hover:text-blue-600 px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors">
                  Log In
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
            <h1 className="text-3xl font-bold text-slate-900 mb-1">Discussion Board</h1>
            <p className="text-slate-500 border-none">Join the conversation, share knowledge, and learn from others.</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
            {/* Search Bar Placeholder */}
            <div className="relative w-full md:w-64 hidden sm:block">
              <input 
                type="text" 
                placeholder="Search discussions..." 
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-shadow"
                disabled
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            
            {isAuthenticated && (
              <Link to="/posts/new" className="shrink-0 flex-1 sm:flex-none">
                <button className="w-full flex justify-center items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm shadow-blue-500/20">
                  <PenSquare className="w-4 h-4" />
                  Write Post
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Filters & Count Row */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center bg-white p-1 rounded-full border border-slate-200 shadow-sm">
            <button className="px-4 py-1.5 text-sm font-semibold text-blue-600 bg-blue-50 rounded-full">All Posts</button>
            <button className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors">Popular</button>
          </div>
          <div className="text-sm text-slate-500">
            Showing <span className="font-bold text-slate-700">1-{posts.length}</span> of <span className="font-bold text-slate-700">{posts.length}</span> posts
          </div>
        </div>

        {/* Posts Table */}
        <div className="bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden border border-slate-100">
          {/* Table Header */}
          <div className="grid grid-cols-[60px_1fr_180px_120px_80px] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>No.</span>
            <span>Title</span>
            <span>Author</span>
            <span>Date</span>
            <span className="text-right">Views</span>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="px-6 py-16 text-center text-slate-400 text-sm">Loading posts...</div>
          )}

          {/* Empty State */}
          {!isLoading && posts.length === 0 && (
            <div className="px-6 py-16 text-center text-slate-400 text-sm">
              No posts yet. Be the first to write one!
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
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: getAvatarColor(post.author.username) }}
                >
                  {getInitials(post.author.username)}
                </div>
                <span className="text-sm text-slate-600 truncate">{post.author.username}</span>
              </div>
              <span className="text-sm text-slate-400">{timeAgo(post.createdAt)}</span>
              <div className="flex items-center justify-end gap-1.5 text-sm text-slate-400">
                <Eye className="w-4 h-4" />
                <span>{post.views}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
};

export default PostList;
