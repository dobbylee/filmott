import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from '@/components/layout/Footer';

describe('Footer', () => {
  it('로고를 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByText((_, el) => el?.textContent === 'filmott')).toBeInTheDocument();
  });

  it('개인정보처리방침과 이용약관 링크를 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByText('개인정보처리방침')).toBeInTheDocument();
    expect(screen.getByText('이용약관')).toBeInTheDocument();
  });

  it('데이터 출처를 표시한다', () => {
    render(<Footer />);
    expect(screen.getByText('TMDB')).toBeInTheDocument();
    expect(screen.getByText('KOBIS')).toBeInTheDocument();
  });

  it('저작권 정보를 표시한다', () => {
    render(<Footer />);
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
  });

  it('이메일 연락처를 표시한다', () => {
    render(<Footer />);
    expect(screen.getByText('filmottkr@gmail.com')).toBeInTheDocument();
  });
});
