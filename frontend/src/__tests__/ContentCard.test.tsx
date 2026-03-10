import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContentCard from '@/components/content/ContentCard';
import type { TmdbSearchItem } from '@/types/content';

// next/image mock
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, ...rest } = props;
    return <img {...rest} data-fill={fill ? 'true' : undefined} />;
  },
}));

// next/link mock
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('ContentCard', () => {
  const movieItem: TmdbSearchItem = {
    id: 550,
    media_type: 'movie',
    title: '파이트 클럽',
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    genre_ids: [18, 53],
  };

  const tvItem: TmdbSearchItem = {
    id: 1399,
    media_type: 'tv',
    name: '왕좌의 게임',
    poster_path: '/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg',
    first_air_date: '2011-04-17',
    vote_average: 8.4,
    genre_ids: [10765, 18],
  };

  it('영화 제목과 연도를 렌더링한다', () => {
    render(<ContentCard item={movieItem} />);
    expect(screen.getByText('파이트 클럽')).toBeInTheDocument();
    expect(screen.getByText('1999')).toBeInTheDocument();
    expect(screen.getByText('영화')).toBeInTheDocument();
  });

  it('TV 프로그램 제목과 연도를 렌더링한다', () => {
    render(<ContentCard item={tvItem} />);
    expect(screen.getByText('왕좌의 게임')).toBeInTheDocument();
    expect(screen.getByText('2011')).toBeInTheDocument();
    expect(screen.getByText('TV')).toBeInTheDocument();
  });

  it('포스터 이미지를 렌더링한다', () => {
    render(<ContentCard item={movieItem} />);
    const img = screen.getByAltText('파이트 클럽');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain('pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');
  });

  it('평점을 표시한다', () => {
    render(<ContentCard item={movieItem} />);
    expect(screen.getByText('8.4')).toBeInTheDocument();
  });

  it('장르 태그를 표시한다', () => {
    render(<ContentCard item={movieItem} />);
    expect(screen.getByText('드라마')).toBeInTheDocument();
  });

  it('올바른 링크를 생성한다 (영화)', () => {
    render(<ContentCard item={movieItem} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/contents/movie/550');
  });

  it('올바른 링크를 생성한다 (TV)', () => {
    render(<ContentCard item={tvItem} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/contents/tv/1399');
  });

  it('포스터가 없을 때 "포스터 없음"을 표시한다', () => {
    const noPosterItem = { ...movieItem, poster_path: undefined };
    render(<ContentCard item={noPosterItem} />);
    expect(screen.getByText('포스터 없음')).toBeInTheDocument();
  });
});
