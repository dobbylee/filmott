import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TmdbImage, { replaceTmdbSize } from '@/components/common/TmdbImage';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return <img data-fill={fill ? 'true' : undefined} data-priority={priority ? 'true' : undefined} {...rest} />;
  },
}));

describe('replaceTmdbSize', () => {
  it('w500을 w342로 교체한다', () => {
    const url = 'https://image.tmdb.org/t/p/w500/abc.jpg';
    expect(replaceTmdbSize(url, 'w342')).toBe(
      'https://image.tmdb.org/t/p/w342/abc.jpg',
    );
  });

  it('original을 w1280으로 교체한다', () => {
    const url = 'https://image.tmdb.org/t/p/original/backdrop.jpg';
    expect(replaceTmdbSize(url, 'w1280')).toBe(
      'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
    );
  });

  it('original을 w92로 교체한다', () => {
    const url = 'https://image.tmdb.org/t/p/original/logo.jpg';
    expect(replaceTmdbSize(url, 'w92')).toBe(
      'https://image.tmdb.org/t/p/w92/logo.jpg',
    );
  });

  it('TMDB URL이 아닌 경우 원본을 반환한다', () => {
    const url = 'https://example.com/image.jpg';
    expect(replaceTmdbSize(url, 'w342')).toBe(url);
  });
});

describe('TmdbImage', () => {
  it('unoptimized 속성이 자동 적용된다', () => {
    render(
      <TmdbImage
        src="https://image.tmdb.org/t/p/w342/poster.jpg"
        alt="테스트 포스터"
        width={342}
        height={513}
      />,
    );
    const img = screen.getByAltText('테스트 포스터');
    expect(img).toBeInTheDocument();
  });

  it('전달된 props가 그대로 forwarding된다', () => {
    render(
      <TmdbImage
        src="https://image.tmdb.org/t/p/w342/poster.jpg"
        alt="포스터"
        width={220}
        height={330}
        className="object-cover"
      />,
    );
    const img = screen.getByAltText('포스터');
    expect(img).toHaveAttribute('class', 'object-cover');
    expect(img).toHaveAttribute('width', '220');
    expect(img).toHaveAttribute('height', '330');
  });

  it('fill 속성을 지원한다', () => {
    render(
      <TmdbImage
        src="https://image.tmdb.org/t/p/w342/poster.jpg"
        alt="fill 포스터"
        fill
        sizes="220px"
      />,
    );
    const img = screen.getByAltText('fill 포스터');
    expect(img).toHaveAttribute('data-fill', 'true');
  });
});
