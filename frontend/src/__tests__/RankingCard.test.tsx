import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RankingCard from '@/components/ranking/RankingCard';
import type { RankingItem } from '@/components/ranking/RankingCard';

describe('RankingCard', () => {
  const item: RankingItem = {
    id: 1,
    rank: 1,
    content: {
      id: 100,
      tmdbId: 12345,
      contentType: 'movie',
      title: '테스트 영화',
      posterUrl: 'https://image.tmdb.org/t/p/w342/poster.jpg',
      voteAverage: 8.5,
    },
  };

  it('순위를 표시한다', () => {
    render(<RankingCard item={item} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('제목을 표시한다', () => {
    render(<RankingCard item={item} />);
    expect(screen.getByText('테스트 영화')).toBeInTheDocument();
  });

  it('평점을 표시한다', () => {
    render(<RankingCard item={item} />);
    expect(screen.getByText('8.5')).toBeInTheDocument();
  });

  it('content 없을 때 title 필드를 사용한다', () => {
    const noContent: RankingItem = {
      id: 2,
      rank: 3,
      content: null,
      title: '매칭 안된 영화',
    };
    render(<RankingCard item={noContent} />);
    expect(screen.getByText('매칭 안된 영화')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('작품 상세 링크가 올바르다', () => {
    render(<RankingCard item={item} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/contents/movie/12345');
  });

  it('content가 없지만 ranking posterUrl이 있으면 포스터를 표시한다', () => {
    const withPoster: RankingItem = {
      id: 3,
      rank: 5,
      content: null,
      title: '수동 포스터 영화',
      posterUrl: 'https://example.com/manual-poster.jpg',
    };
    render(<RankingCard item={withPoster} />);
    const img = screen.getByAltText('수동 포스터 영화');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringContaining('manual-poster.jpg'));
  });

  it('content가 없고 posterUrl도 있으면 opacity-60이 적용되지 않는다', () => {
    const withPoster: RankingItem = {
      id: 4,
      rank: 7,
      content: null,
      title: '포스터 있는 영화',
      posterUrl: 'https://example.com/poster.jpg',
    };
    const { container } = render(<RankingCard item={withPoster} />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).not.toContain('opacity-60');
  });

  it('content.posterUrl이 ranking posterUrl보다 우선한다', () => {
    const withBothPosters: RankingItem = {
      id: 5,
      rank: 2,
      posterUrl: 'https://example.com/ranking-poster.jpg',
      content: {
        id: 200,
        tmdbId: 99999,
        contentType: 'movie',
        title: '양쪽 포스터',
        posterUrl: 'https://example.com/content-poster.jpg',
      },
    };
    render(<RankingCard item={withBothPosters} />);
    const img = screen.getByAltText('양쪽 포스터');
    expect(img).toHaveAttribute('src', expect.stringContaining('content-poster.jpg'));
  });
});
