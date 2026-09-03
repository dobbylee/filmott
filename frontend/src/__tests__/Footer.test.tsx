import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from '@/components/layout/Footer';

describe('Footer', () => {
  it('로고를 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: /^film\s*ott$/i })).toHaveClass(
      'text-3xl',
    );
  });

  it('기존 AI 추천 태그라인을 표시하지 않는다', () => {
    render(<Footer />);
    expect(
      screen.queryByText('AI가 취향에 맞는 영화/시리즈를 추천해 드립니다'),
    ).not.toBeInTheDocument();
  });

  it('개인정보처리방침과 이용약관 링크를 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getAllByText('개인정보처리방침')).toHaveLength(2);
    expect(screen.getAllByText('이용약관')).toHaveLength(2);
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
    expect(screen.getByTestId('footer-desktop-contact')).toHaveClass('text-sm');
    expect(screen.getByTestId('footer-email')).toBeInTheDocument();
    expect(screen.getByTestId('footer-desktop-policy')).toBeInTheDocument();
  });

  it('PC 영화와 시리즈를 큰 텍스트 링크로 한 줄에 표시해야 한다', () => {
    render(<Footer />);

    expect(screen.getByTestId('footer-discovery-links')).toHaveClass(
      'text-lg',
      'items-center',
      'justify-center',
      'gap-2',
    );
    expect(screen.getByTestId('footer-discovery-separator')).toHaveTextContent(
      '|',
    );
    expect(screen.getAllByRole('link', { name: '영화' })[1]).not.toHaveClass(
      'rounded-xl',
      'bg-white/5',
    );
  });

  it('PC에서는 출처, 탐색, 정책을 3열로 배치해야 한다', () => {
    render(<Footer />);

    expect(screen.getByTestId('footer-content')).toHaveClass(
      'hidden',
      'sm:grid',
      'sm:grid-cols-3',
      'sm:items-center',
      'py-5',
    );
    expect(screen.queryByText('탐색')).not.toBeInTheDocument();
    expect(screen.queryByText('정책')).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: '영화' })
        .every((link) => link.getAttribute('href') === '/discover?type=movie'),
    ).toBe(true);
    expect(
      screen
        .getAllByRole('link', { name: '시리즈' })
        .every((link) => link.getAttribute('href') === '/discover?type=tv'),
    ).toBe(true);
  });

  it('모바일에서는 로고와 이메일을 제외한 링크를 압축 표시해야 한다', () => {
    render(<Footer />);

    expect(screen.getByTestId('footer-mobile-content')).toHaveClass(
      'sm:hidden',
    );
    expect(screen.getByTestId('footer-content')).toHaveClass('hidden');
    expect(screen.getByTestId('footer-mobile-discovery')).toHaveClass(
      'grid-cols-2',
    );
    expect(screen.getAllByRole('link', { name: '영화' })[0]).toHaveClass(
      'rounded-xl',
      'bg-white/5',
      'px-4',
      'py-3',
    );
    expect(screen.getByTestId('footer-mobile-policy')).toHaveClass(
      'grid',
      'grid-cols-2',
      'border-t',
      'border-white/5',
      'pt-4',
      'text-base',
    );
    expect(screen.getByTestId('footer-mobile-policy')).not.toHaveTextContent(
      '|',
    );
    expect(screen.getAllByRole('link', { name: '개인정보처리방침' })[0]).toHaveClass(
      'border-r',
      'border-white/10',
    );
  });

  it('저작권을 구분선 아래 최하단에 표시해야 한다', () => {
    render(<Footer />);

    expect(screen.getByTestId('footer-legal')).toHaveClass(
      'border-t',
      'text-sm',
    );
    expect(screen.getByTestId('footer-source-content')).toBeInTheDocument();
  });
});
