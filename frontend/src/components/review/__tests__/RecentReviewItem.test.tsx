import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RecentReviewItem from '@/components/review/RecentReviewItem';
import type { Review } from '@/types/review';

// TimeAgo is a client component; stub it for SSR-compatible test
vi.mock('@/components/common/TimeAgo', () => ({
  default: ({ date, className }: { date: string; className?: string }) => (
    <span className={className} data-testid="time-ago">{date}</span>
  ),
}));

// next/image stub
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt as string} />
  ),
}));

const baseReview: Review = {
  id: 1,
  userId: 10,
  contentId: 100,
  rating: 4.5,
  comment: 'Great movie!',
  likesCount: 5,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  user: { id: 10, nickname: 'Alice', email: 'alice@test.com', status: 'ACTIVE' },
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
};

describe('RecentReviewItem', () => {
  it('renders review with user nickname and rating', () => {
    render(<RecentReviewItem review={baseReview} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('Great movie!')).toBeInTheDocument();
  });

  it('renders content title and poster', () => {
    render(<RecentReviewItem review={baseReview} />);

    expect(screen.getByText('Test Movie')).toBeInTheDocument();
    expect(screen.getByAltText('Test Movie')).toBeInTheDocument();
  });

  it('renders deleted user fallback', () => {
    const deletedReview: Review = {
      ...baseReview,
      user: { id: 99, nickname: 'deleted', email: '', status: 'DELETED' },
    };
    render(<RecentReviewItem review={deletedReview} />);

    expect(screen.getByText('탈퇴한 사용자')).toBeInTheDocument();
  });

  it('renders without comment when comment is absent', () => {
    const noCommentReview: Review = { ...baseReview, comment: undefined };
    render(<RecentReviewItem review={noCommentReview} />);

    expect(screen.queryByText('Great movie!')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders correct link href for content', () => {
    render(<RecentReviewItem review={baseReview} />);

    const links = screen.getAllByRole('link');
    const contentLinks = links.filter((link) =>
      link.getAttribute('href')?.includes('/contents/movie/12345'),
    );
    expect(contentLinks.length).toBeGreaterThan(0);
  });
});
