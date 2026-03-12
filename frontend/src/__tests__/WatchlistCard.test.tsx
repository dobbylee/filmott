import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchlistCard from '@/components/watchlist/WatchlistCard';
import type { WatchlistItem } from '@/types/watchlist';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseContent = {
  id: 1,
  tmdbId: 123,
  contentType: 'movie' as const,
  title: '인셉션',
  posterUrl: '/poster.jpg',
  releaseDate: '2010-07-16',
  genres: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const watchedItem: WatchlistItem = {
  id: 1,
  userId: 1,
  contentId: 1,
  status: 'watched',
  watchedAt: '2026-03-10T00:00:00Z',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-10T00:00:00Z',
  content: baseContent,
  review: {
    id: 1,
    userId: 1,
    contentId: 1,
    rating: 4.5,
    comment: '최고의 SF 영화',
    likesCount: 0,
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
};

const wantToWatchItem: WatchlistItem = {
  id: 2,
  userId: 1,
  contentId: 2,
  status: 'want_to_watch',
  watchedAt: null,
  createdAt: '2026-03-05T00:00:00Z',
  updatedAt: '2026-03-05T00:00:00Z',
  content: {
    ...baseContent,
    id: 2,
    tmdbId: 456,
    contentType: 'tv',
    title: '브레이킹 배드',
    releaseDate: '2008-01-20',
  },
};

describe('WatchlistCard', () => {
  it('should render watched item with review preview', () => {
    render(<WatchlistCard item={watchedItem} />);

    expect(screen.getByText('인셉션')).toBeInTheDocument();
    expect(screen.getByText(/영화 · 2010/)).toBeInTheDocument();
    expect(screen.getByText(/감상일/)).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('최고의 SF 영화')).toBeInTheDocument();
  });

  it('should render want_to_watch item with action buttons', () => {
    const onMarkWatched = vi.fn();
    const onRemove = vi.fn();

    render(
      <WatchlistCard
        item={wantToWatchItem}
        onMarkWatched={onMarkWatched}
        onRemove={onRemove}
      />
    );

    expect(screen.getByText('브레이킹 배드')).toBeInTheDocument();
    expect(screen.getByText(/시리즈/)).toBeInTheDocument();
    expect(screen.getByText(/추가일/)).toBeInTheDocument();
    expect(screen.getByText('감상 완료')).toBeInTheDocument();
    expect(screen.getByText('제거')).toBeInTheDocument();
  });

  it('should call onMarkWatched when "감상 완료" button clicked', async () => {
    const user = userEvent.setup();
    const onMarkWatched = vi.fn();
    const onRemove = vi.fn();

    render(
      <WatchlistCard
        item={wantToWatchItem}
        onMarkWatched={onMarkWatched}
        onRemove={onRemove}
      />
    );

    await user.click(screen.getByText('감상 완료'));
    expect(onMarkWatched).toHaveBeenCalledWith(2);
  });

  it('should call onRemove when "제거" button clicked', async () => {
    const user = userEvent.setup();
    const onMarkWatched = vi.fn();
    const onRemove = vi.fn();

    render(
      <WatchlistCard
        item={wantToWatchItem}
        onMarkWatched={onMarkWatched}
        onRemove={onRemove}
      />
    );

    await user.click(screen.getByText('제거'));
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('should not show action buttons for watched items', () => {
    render(<WatchlistCard item={watchedItem} />);

    expect(screen.queryByText('감상 완료')).not.toBeInTheDocument();
    expect(screen.queryByText('제거')).not.toBeInTheDocument();
  });

  it('should link to content detail page', () => {
    render(<WatchlistCard item={watchedItem} />);

    const links = screen.getAllByRole('link');
    const contentLinks = links.filter(
      (link) => link.getAttribute('href') === '/contents/movie/123'
    );
    expect(contentLinks.length).toBeGreaterThan(0);
  });
});
