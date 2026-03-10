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
});
