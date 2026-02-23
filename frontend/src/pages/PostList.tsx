import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, PenSquare, Layers } from 'lucide-react';
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

// Relative time
const timeAgo = (date: string) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return count === 1
        ? interval.label === 'day'
          ? 'Yesterday'
          : `${count} ${interval.label} ago`
        : `${count} ${interval.label}s ago`;
    }
  }
  return 'Just now';
};

const PostList: React.FC = () => {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated } = useAuth();

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
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <Link to="/posts/new">
                <button className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm shadow-blue-500/20">
                  <PenSquare className="w-4 h-4" />
                  Write Post
                </button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Discussion Board</h1>
          <p className="text-slate-500">Join the conversation, share knowledge, and learn from others.</p>
        </div>

        {/* Post count */}
        <div className="flex justify-end mb-4">
          <span className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{posts.length}</span> posts
          </span>
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
