import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReviewList from '@/components/review/ReviewList';
import type { Review } from '@/types/review';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    logout: vi.fn(),
    handleAuthSuccess: vi.fn(),
    token: null,
    isLoading: false,
    updateUser: vi.fn(),
    openAuthModal: vi.fn(),
    closeAuthModal: vi.fn(),
    authModal: { isOpen: false },
  }),
}));

describe('ReviewList', () => {
  const reviews: Review[] = [
    {
      id: 1,
      userId: 10,
      contentId: 100,
      rating: 8,
      comment: '좋은 영화!',

      likesCount: 3,
      createdAt: '2024-12-25T12:00:00Z',
      updatedAt: '2024-12-25T12:00:00Z',
      user: { id: 10, nickname: '유저1' },
    },
    {
      id: 2,
      userId: 20,
      contentId: 100,
      rating: 6,
      comment: '보통이에요.',

      likesCount: 1,
      createdAt: '2024-12-26T12:00:00Z',
      updatedAt: '2024-12-26T12:00:00Z',
      user: { id: 20, nickname: '유저2' },
    },
  ];

  it('리뷰 목록을 렌더링한다', () => {
    render(<ReviewList reviews={reviews} />);
    expect(screen.getByText('좋은 영화!')).toBeInTheDocument();
    expect(screen.getByText('보통이에요.')).toBeInTheDocument();
  });

  it('빈 목록일 때 기본 메시지를 표시한다', () => {
    render(<ReviewList reviews={[]} />);
    expect(screen.getByText('아직 리뷰가 없습니다.')).toBeInTheDocument();
  });

  it('빈 목록일 때 커스텀 메시지를 표시한다', () => {
    render(<ReviewList reviews={[]} emptyMessage="리뷰가 없습니다." />);
    expect(screen.getByText('리뷰가 없습니다.')).toBeInTheDocument();
  });
});
