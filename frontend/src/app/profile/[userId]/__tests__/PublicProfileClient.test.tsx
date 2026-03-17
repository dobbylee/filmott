import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicProfileClient from '../PublicProfileClient';
import type { PublicProfile } from '@/types/auth';
import type { ReviewsResponse } from '@/types/review';

// next/navigation mock
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// AuthContext mock
const mockUser = { id: 99, nickname: 'me' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// next/image mock
vi.mock('next/image', () => ({
  default: ({ fill: _fill, sizes: _sizes, ...props }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt as string} />
  ),
}));

// TimeAgo mock
vi.mock('@/components/common/TimeAgo', () => ({
  default: ({ date, className }: { date: string; className?: string }) => (
    <span className={className} data-testid="time-ago">{date}</span>
  ),
}));

const baseProfile: PublicProfile = {
  id: 1,
  nickname: 'TestUser',
  profileImage: null,
  createdAt: '2025-01-15T00:00:00Z',
  reviewCount: 5,
  watchedCount: 10,
  wantToWatchCount: 3,
};

const emptyReviews: ReviewsResponse = {
  data: [],
  total: 0,
  page: 1,
  totalPages: 0,
};

const reviewsWithData: ReviewsResponse = {
  data: [
    {
      id: 1,
      userId: 1,
      contentId: 100,
      rating: 4,
      comment: 'Great film!',
      likesCount: 2,
      createdAt: '2025-01-20T00:00:00Z',
      updatedAt: '2025-01-20T00:00:00Z',
      user: { id: 1, nickname: 'TestUser', status: 'ACTIVE' },
      content: {
        id: 100,
        tmdbId: 12345,
        contentType: 'movie',
        title: 'Test Movie',
        posterUrl: '/poster.jpg',
        genres: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    },
  ],
  total: 1,
  page: 1,
  totalPages: 1,
};

describe('PublicProfileClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('프로필 닉네임과 통계를 렌더링한다', () => {
    render(<PublicProfileClient profile={baseProfile} reviews={emptyReviews} />);

    expect(screen.getByText('TestUser')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // reviewCount
    expect(screen.getByText('10')).toBeInTheDocument(); // watchedCount
    expect(screen.getByText('3')).toBeInTheDocument(); // wantToWatchCount
  });

  it('가입일을 표시한다', () => {
    render(<PublicProfileClient profile={baseProfile} reviews={emptyReviews} />);

    // 2025년 1월 15일 형식
    expect(screen.getByText(/2025년/)).toBeInTheDocument();
    expect(screen.getByText(/가입/)).toBeInTheDocument();
  });

  it('리뷰가 없으면 빈 메시지를 표시한다', () => {
    render(<PublicProfileClient profile={baseProfile} reviews={emptyReviews} />);

    expect(screen.getByText('아직 작성한 리뷰가 없습니다.')).toBeInTheDocument();
  });

  it('리뷰가 있으면 리뷰 목록을 표시한다', () => {
    render(<PublicProfileClient profile={baseProfile} reviews={reviewsWithData} />);

    expect(screen.getByText('Great film!')).toBeInTheDocument();
    expect(screen.getByText('Test Movie')).toBeInTheDocument();
  });

  it('자기 자신의 프로필이면 /profile로 리다이렉트한다', () => {
    const myProfile: PublicProfile = { ...baseProfile, id: 99 }; // mockUser.id === 99
    render(<PublicProfileClient profile={myProfile} reviews={emptyReviews} />);

    expect(mockReplace).toHaveBeenCalledWith('/profile');
  });

  it('다른 유저의 프로필이면 리다이렉트하지 않는다', () => {
    render(<PublicProfileClient profile={baseProfile} reviews={emptyReviews} />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('통계 라벨을 표시한다', () => {
    render(<PublicProfileClient profile={baseProfile} reviews={emptyReviews} />);

    expect(screen.getByText('리뷰')).toBeInTheDocument();
    expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    expect(screen.getByText('감상할 작품')).toBeInTheDocument();
  });
});
