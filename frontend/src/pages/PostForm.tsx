import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { api } from '../api';
import { getErrorMessage } from '../utils/error';

const PostForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load existing post data when editing
  useEffect(() => {
    if (isEditMode) {
      const fetchPost = async () => {
        try {
          const response = await api.get(`/posts/${id}`);
          setTitle(response.data.title);
          setContent(response.data.content);
        } catch (err) {
          console.error('Failed to load post', err);
          navigate('/posts');
        }
      };
      fetchPost();
    }
  }, [id, isEditMode, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Please fill in both the title and content.');
      return;
    }
    if (content.trim().length < 10) {
      setError('Content must be at least 10 characters long.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      if (isEditMode) {
        await api.patch(`/posts/${id}`, { title, content });
        navigate(`/posts/${id}`);
      } else {
        const response = await api.post('/posts', { title, content });
        navigate(`/posts/${response.data.id}`);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save post.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link to="/posts" className="hover:text-blue-500 transition-colors flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Back to Feed
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">
            {isEditMode ? 'Edit Post' : 'Create Post'}
          </span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            {isEditMode ? 'Edit your post' : 'Create a new post'}
          </h1>
          <p className="text-slate-500">
            Share your knowledge with the developer community.
          </p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] border border-slate-100 p-8 md:p-10 mb-6">
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm text-center font-medium mb-6">
                {error}
              </div>
            )}

            {/* Title Input */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a captivating title..."
              className="w-full text-2xl font-bold text-slate-900 placeholder:text-slate-300 placeholder:font-normal border-none outline-none mb-6 bg-transparent"
              disabled={isLoading}
            />

            <hr className="border-slate-100 mb-6" />

            {/* Content Textarea */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your thoughts here... Explain your idea, tutorial, or question in detail."
              rows={16}
              className="w-full text-sm text-slate-700 placeholder:text-slate-400 border-none outline-none resize-y leading-relaxed bg-transparent"
              disabled={isLoading}
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate(isEditMode ? `/posts/${id}` : '/posts')}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-70"
            >
              <Send className="w-4 h-4" />
              {isLoading
                ? 'Saving...'
                : isEditMode
                  ? 'Update Post'
                  : 'Publish Post'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default PostForm;
