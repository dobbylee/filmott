import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from '@/components/layout/Footer';

describe('Footer', () => {
  it('로고를 렌더링한다', () => {
    render(<Footer />);
    const logo = screen.getByRole('link', { name: /^film\s*ott$/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveClass('text-3xl');
  });

  it('기존 AI 추천 태그라인을 표시하지 않는다', () => {
    render(<Footer />);
    expect(
      screen.queryByText('AI가 취향에 맞는 영화/시리즈를 추천해 드립니다'),
    ).not.toBeInTheDocument();
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
