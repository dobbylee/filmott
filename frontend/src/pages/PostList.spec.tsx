import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import PostList from './PostList';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    logout: vi.fn(),
  }),
}));

const LIMIT = 20;

const makePost = (id: number) => ({
  id,
  title: `Post ${id}`,
  views: id * 10,
  createdAt: new Date().toISOString(),
  author: { id: 1, username: 'testuser' },
});

const makePaginatedResponse = (total: number, page: number) => {
  const start = (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);
  const data = Array.from({ length: end - start + 1 }, (_, i) => makePost(start + i));
  return {
    data,
    total,
    page,
    limit: LIMIT,
    totalPages: Math.ceil(total / LIMIT),
  };
};

const renderPostList = () =>
  render(
    <MemoryRouter>
      <PostList />
    </MemoryRouter>,
  );

describe('PostList - Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders posts from paginated API response', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: makePaginatedResponse(2, 1),
    });

    renderPostList();

    await waitFor(() => {
      expect(screen.getByText('Post 1')).toBeInTheDocument();
      expect(screen.getByText('Post 2')).toBeInTheDocument();
    });
  });

  it('calls API with page and limit params', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: makePaginatedResponse(2, 1),
    });

    renderPostList();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/posts', {
        params: { page: 1, limit: LIMIT },
      });
    });
  });

  it('shows pagination controls when totalPages > 1', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: makePaginatedResponse(25, 1),
    });

    renderPostList();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /이전/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /다음/i })).toBeInTheDocument();
    });
  });

  it('hides pagination controls when totalPages <= 1', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: makePaginatedResponse(5, 1),
    });

    renderPostList();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /이전/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /다음/i })).not.toBeInTheDocument();
    });
  });

  it('disables Previous button on page 1', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: makePaginatedResponse(25, 1),
    });

    renderPostList();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /이전/i })).toBeDisabled();
    });
  });

  it('disables Next button on last page', async () => {
    (api.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: makePaginatedResponse(25, 1) })
      .mockResolvedValueOnce({ data: makePaginatedResponse(25, 2) });

    renderPostList();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /다음/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /다음/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /다음/i })).toBeDisabled();
    });
  });

  it('fetches page 2 when Next button is clicked', async () => {
    (api.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: makePaginatedResponse(25, 1) })
      .mockResolvedValueOnce({ data: makePaginatedResponse(25, 2) });

    renderPostList();

    await waitFor(() => {
      expect(screen.getByText('Post 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /다음/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/posts', {
        params: { page: 2, limit: LIMIT },
      });
    });
  });

  it('fetches page 1 again when Previous button is clicked from page 2', async () => {
    (api.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: makePaginatedResponse(25, 1) })
      .mockResolvedValueOnce({ data: makePaginatedResponse(25, 2) })
      .mockResolvedValueOnce({ data: makePaginatedResponse(25, 1) });

    renderPostList();

    await waitFor(() => screen.getByText('Post 1'));

    fireEvent.click(screen.getByRole('button', { name: /다음/i }));
    await waitFor(() => screen.getByText('Post 21'));

    fireEvent.click(screen.getByRole('button', { name: /이전/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/posts', {
        params: { page: 1, limit: LIMIT },
      });
    });
  });

  it('displays correct counter range', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: makePaginatedResponse(25, 1),
    });

    renderPostList();

    await waitFor(() => {
      expect(screen.getByText('1-20')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });
});
