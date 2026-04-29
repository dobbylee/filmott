import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ReviewFormWrapper from '@/components/review/ReviewFormWrapper';
import type { Review } from '@/types/review';

const mockGet = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, nickname: '테스터' },
    isLoading: false,
    openAuthModal: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('ReviewFormWrapper', () => {
  let currentReview: Review | null;

  beforeEach(() => {
    currentReview = null;
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/reviews/my')) {
        return Promise.resolve({ data: currentReview });
      }
      if (url.startsWith('/reviews/liked-ids')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: null });
    });
  });

  it('감상 기록 갱신 이벤트를 받으면 내 리뷰를 다시 조회해야 한다', async () => {
    render(<ReviewFormWrapper contentId={10} />);

    await waitFor(() => {
      expect(screen.getByText('리뷰 작성')).toBeInTheDocument();
    });

    currentReview = {
      id: 100,
      userId: 1,
      contentId: 10,
      rating: 9,
      comment: '드롭다운에서 작성한 리뷰',
      likesCount: 0,
      createdAt: '2026-04-30T00:00:00Z',
      updatedAt: '2026-04-30T00:00:00Z',
    };

    act(() => {
      window.dispatchEvent(new Event('watchlist-updated'));
    });

    await waitFor(() => {
      expect(screen.getByText('내 리뷰')).toBeInTheDocument();
      expect(screen.getByText('드롭다운에서 작성한 리뷰')).toBeInTheDocument();
    });
  });
});
