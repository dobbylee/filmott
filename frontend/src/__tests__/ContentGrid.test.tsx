import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContentGrid from '@/components/content/ContentGrid';
import type { TmdbSearchItem } from '@/types/content';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, ...rest } = props;
    return <img {...rest} data-fill={fill ? 'true' : undefined} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('ContentGrid', () => {
  const items: TmdbSearchItem[] = [
    {
      id: 1,
      media_type: 'movie',
      title: '영화 1',
      poster_path: '/test1.jpg',
      release_date: '2024-01-01',
      vote_average: 7.5,
      genre_ids: [],
    },
    {
      id: 2,
      media_type: 'tv',
      name: 'TV 프로그램 1',
      poster_path: '/test2.jpg',
      first_air_date: '2024-06-15',
      vote_average: 8.0,
      genre_ids: [],
    },
  ];

  it('아이템들을 렌더링한다', () => {
    render(<ContentGrid items={items} />);
    expect(screen.getByText('영화 1')).toBeInTheDocument();
    expect(screen.getByText('TV 프로그램 1')).toBeInTheDocument();
  });

  it('빈 목록일 때 기본 메시지를 표시한다', () => {
    render(<ContentGrid items={[]} />);
    expect(screen.getByText('결과가 없습니다.')).toBeInTheDocument();
  });

  it('빈 목록일 때 커스텀 메시지를 표시한다', () => {
    render(<ContentGrid items={[]} emptyMessage="검색 결과가 없습니다." />);
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });
});
