import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from '@/components/layout/Footer';

describe('Footer', () => {
  it('로고와 설명을 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByText('filmott')).toBeInTheDocument();
    expect(
      screen.getByText('영화, 드라마 한줄평과 별점을 남기고 공유하세요.'),
    ).toBeInTheDocument();
  });

  it('네비게이션 링크를 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByText('홈')).toBeInTheDocument();
    expect(screen.getByText('영화')).toBeInTheDocument();
    expect(screen.getByText('TV')).toBeInTheDocument();
    expect(screen.getByText('탐색')).toBeInTheDocument();
  });

  it('저작권 정보를 표시한다', () => {
    render(<Footer />);
    expect(screen.getByText(/filmott.*TMDB/)).toBeInTheDocument();
  });
});
