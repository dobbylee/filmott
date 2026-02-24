import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Eye, Calendar, User as UserIcon } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface PostDetail {
  id: number;
  title: string;
  content: string;
  views: number;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    username: string;
    email: string;
  } | null;
}

const timeAgo = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return '방금 전';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}일 전`;
  
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fetchPost = async () => {
      try {
        const response = await api.get<PostDetail>(`/posts/${id}`);
        setPost(response.data);
      } catch (error) {
        console.error('Failed to fetch post', error);
        navigate('/posts');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPost();
  }, [id, navigate]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await api.delete(`/posts/${id}`);
      navigate('/posts');
    } catch (error) {
      console.error('Failed to delete post', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Loading post...</p>
      </div>
    );
  }

  if (!post) return null;

  const isAuthor = post.author && user?.id === post.author.id;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          to="/posts"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-500 mb-6 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Discussions
        </Link>

        {/* Post card */}
        <article className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] border border-slate-100 p-8 md:p-10">
          {/* Title + actions */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
              {post.title}
            </h1>
            {isAuthor && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate(`/posts/${post.id}/edit`)}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-500 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Author info */}
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <UserIcon className="w-4 h-4" />
              <span className="font-semibold text-slate-700">
                {post.author ? post.author.username : '탈퇴한 사용자'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>{timeAgo(post.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <Eye className="w-4 h-4" />
              <span>{post.views} views</span>
            </div>
          </div>

          {/* Content */}
          <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">
            {post.content}
          </div>
        </article>
      </main>
    </div>
  );
};

export default PostDetailPage;
