import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from '@/components/layout/Footer';

describe('Footer', () => {
  it('헤더와 중복되는 로고를 렌더링하지 않는다', () => {
    render(<Footer />);
    expect(
      screen.queryByRole('link', { name: /^film\s*ott$/i }),
    ).not.toBeInTheDocument();
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

  it('PC에서는 현재 높이를 유지하고 양쪽 콘텐츠를 중앙 정렬해야 한다', () => {
    render(<Footer />);

    expect(screen.getByTestId('footer-content')).toHaveClass(
      'sm:min-h-[124px]',
      'sm:flex-row',
      'sm:items-center',
      'sm:justify-between',
    );
    expect(screen.getByTestId('footer-source-content')).toHaveClass(
      'sm:text-left',
    );
  });
});
