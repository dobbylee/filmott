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
  default: ({ fill, sizes, unoptimized, ...props }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={typeof props.alt === 'string' ? props.alt : ''}
      data-fill={fill ? 'true' : undefined}
      data-sizes={typeof sizes === 'string' ? sizes : undefined}
      data-unoptimized={unoptimized ? 'true' : undefined}
    />
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
  it('사용자 닉네임과 평점이 포함된 리뷰를 렌더링한다', () => {
    render(<RecentReviewItem review={baseReview} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('Great movie!')).toBeInTheDocument();
  });

  it('작품 제목과 포스터를 렌더링한다', () => {
    render(<RecentReviewItem review={baseReview} />);

    expect(screen.getByText('Test Movie')).toBeInTheDocument();
    expect(screen.getByAltText('Test Movie')).toBeInTheDocument();
  });

  it('탈퇴한 사용자 대체 텍스트를 렌더링한다', () => {
    const deletedReview: Review = {
      ...baseReview,
      user: { id: 99, nickname: 'deleted', email: '', status: 'DELETED' },
    };
    render(<RecentReviewItem review={deletedReview} />);

    expect(screen.getByText('탈퇴한 사용자')).toBeInTheDocument();
  });

  it('코멘트가 없을 때 코멘트 없이 렌더링한다', () => {
    const noCommentReview: Review = { ...baseReview, comment: undefined };
    render(<RecentReviewItem review={noCommentReview} />);

    expect(screen.queryByText('Great movie!')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('작품에 대한 올바른 링크 href를 렌더링한다', () => {
    render(<RecentReviewItem review={baseReview} />);

    const links = screen.getAllByRole('link');
    const contentLinks = links.filter((link) =>
      link.getAttribute('href')?.includes('/contents/movie/12345'),
    );
    expect(contentLinks.length).toBeGreaterThan(0);
  });
});
