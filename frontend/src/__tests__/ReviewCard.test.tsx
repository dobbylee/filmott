import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReviewCard from '@/components/review/ReviewCard';
import type { Review } from '@/types/review';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    logout: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    token: null,
    isLoading: false,
    updateUser: vi.fn(),
    openAuthModal: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: { data: [], total: 0, page: 1, totalPages: 0 } }),
  },
}));

describe('ReviewCard', () => {
  const review: Review = {
    id: 1,
    userId: 10,
    contentId: 100,
    rating: 8,
    comment: '정말 좋은 영화입니다!',
    likesCount: 5,
    createdAt: '2024-12-25T12:00:00Z',
    updatedAt: '2024-12-25T12:00:00Z',
    user: {
      id: 10,
      nickname: '영화팬',
      email: 'fan@test.com',
    },
  };

  it('닉네임과 코멘트를 렌더링한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('영화팬')).toBeInTheDocument();
    expect(screen.getByText('정말 좋은 영화입니다!')).toBeInTheDocument();
  });

  it('평점을 표시한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('좋아요 수를 표시한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('닉네임 첫 글자를 아바타로 표시한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('영')).toBeInTheDocument();
  });

  it('댓글 아이콘과 수를 표시한다', () => {
    render(<ReviewCard review={{ ...review, commentsCount: 3 }} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('showInteractions=false 시 좋아요 텍스트만 표시한다', () => {
    render(<ReviewCard review={review} showInteractions={false} />);
    expect(screen.getByText('5 좋아요')).toBeInTheDocument();
  });
});
