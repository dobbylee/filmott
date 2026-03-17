import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReviewListClient from '@/components/review/ReviewListClient';
import type { Review } from '@/types/review';

// AuthContext mock
const mockUser = { id: 1, nickname: 'tester', role: 'USER' };
let currentUser: typeof mockUser | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: currentUser,
  }),
}));

// api mock
const mockGet = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

// LikeButton / ReviewCommentsModal stub
vi.mock('@/components/review/LikeButton', () => ({
  default: () => <span data-testid="like-button">like</span>,
}));
vi.mock('@/components/review/ReviewCommentsModal', () => ({
  default: () => null,
}));

const makeReview = (overrides: Partial<Review> = {}): Review => ({
  id: 10,
  userId: 2,
  contentId: 100,
  rating: 4,
  comment: 'Good movie',
  likesCount: 3,
  createdAt: '2025-06-01T00:00:00Z',
  updatedAt: '2025-06-01T00:00:00Z',
  user: { id: 2, nickname: 'reviewer' },
  ...overrides,
});

describe('ReviewListClient', () => {
  beforeEach(() => {
    currentUser = null;
    mockGet.mockReset();
  });

  it('초기 리뷰 목록을 렌더링한다', () => {
    const reviews = [makeReview()];
    render(<ReviewListClient reviews={reviews} contentId={100} />);

    expect(screen.getByText('Good movie')).toBeInTheDocument();
  });

  it('정렬 셀렉터가 표시된다', () => {
    const reviews = [makeReview()];
    render(<ReviewListClient reviews={reviews} contentId={100} />);

    expect(screen.getByText('최신순')).toBeInTheDocument();
    expect(screen.getByText('인기순')).toBeInTheDocument();
  });

  it('비로그인 상태에서 인기순 클릭 시 API를 호출한다', async () => {
    const reviews = [makeReview()];
    mockGet.mockResolvedValueOnce({
      data: { data: [makeReview({ comment: 'Popular review' })] },
    });

    render(<ReviewListClient reviews={reviews} contentId={100} />);

    fireEvent.click(screen.getByText('인기순'));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/reviews?contentId=100&page=1&sort=likes',
      );
    });
  });

  it('로그인 상태에서 인기순 클릭 시 sort=likes로 API를 호출한다', async () => {
    currentUser = mockUser;
    const reviews = [makeReview()];

    mockGet
      .mockResolvedValueOnce({
        data: { data: [makeReview()] },
      })
      .mockResolvedValueOnce({
        data: [10],
      });

    render(<ReviewListClient reviews={reviews} contentId={100} />);

    // 초기 로딩 완료 대기
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    mockGet.mockClear();
    mockGet
      .mockResolvedValueOnce({
        data: { data: [makeReview({ comment: 'Popular' })] },
      })
      .mockResolvedValueOnce({
        data: [],
      });

    fireEvent.click(screen.getByText('인기순'));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/reviews?contentId=100&page=1&sort=likes',
      );
    });
  });

  it('리뷰가 없을 때 안내 메시지를 표시한다', () => {
    render(<ReviewListClient reviews={[]} contentId={100} />);

    expect(screen.getByText('아직 리뷰가 없습니다.')).toBeInTheDocument();
  });
});
