import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from '@/components/layout/Footer';

describe('Footer', () => {
  it('로고와 소개 문구를 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByText((_, el) => el?.textContent === 'filmott')).toBeInTheDocument();
    expect(
      screen.getByText('영화와 드라마를 기록하고 공유하는 공간.'),
    ).toBeInTheDocument();
  });

  it('탐색 링크를 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByText('영화')).toBeInTheDocument();
    expect(screen.getByText('시리즈')).toBeInTheDocument();
    expect(screen.getByText('전체 탐색')).toBeInTheDocument();
  });

  it('안내 링크를 렌더링한다', () => {
    render(<Footer />);
    const privacyLink = screen.getByText('개인정보처리방침');
    const termsLink = screen.getByText('이용약관');
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink.closest('a')).toHaveAttribute('href', '/privacy');
    expect(termsLink).toBeInTheDocument();
    expect(termsLink.closest('a')).toHaveAttribute('href', '/terms');
  });

  it('저작권 정보를 표시한다', () => {
    render(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year} filmott`))).toBeInTheDocument();
  });

  it('TMDB와 KOBIS 출처 링크를 표시한다', () => {
    render(<Footer />);
    const tmdbLink = screen.getByText('TMDB');
    const kobisLink = screen.getByText('KOBIS');
    expect(tmdbLink).toBeInTheDocument();
    expect(tmdbLink.closest('a')).toHaveAttribute('href', 'https://www.themoviedb.org/');
    expect(kobisLink).toBeInTheDocument();
    expect(kobisLink.closest('a')).toHaveAttribute('href', 'https://www.kobis.or.kr/');
  });

  it('섹션 헤딩을 렌더링한다', () => {
    render(<Footer />);
    expect(screen.getByText('탐색')).toBeInTheDocument();
    expect(screen.getByText('안내')).toBeInTheDocument();
  });
});
