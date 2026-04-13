import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RecommendationCard from '@/components/chat/RecommendationCard';
import type { ChatRecommendationWithPoster } from '@/types/chat';

// AuthContext mock
let mockUser: { id: number; nickname: string } | null = { id: 1, nickname: 'tester' };
const mockOpenAuthModal = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    openAuthModal: mockOpenAuthModal,
  }),
}));

// api mock
const mockPost = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// next/image mock
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

// next/link mock
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('RecommendationCard', () => {
  const recommendation: ChatRecommendationWithPoster = {
    tmdbId: 496243,
    contentType: 'movie',
    title: '기생충',
    reason: '봉준호 감독의 명작입니다.',
    posterUrl: '/poster.jpg',
  };

  beforeEach(() => {
    mockUser = { id: 1, nickname: 'tester' };
    mockPost.mockReset();
    mockOpenAuthModal.mockReset();
  });

  it('카드 제목을 렌더링한다', () => {
    render(<RecommendationCard recommendation={recommendation} />);
    expect(screen.getByText('기생충')).toBeInTheDocument();
  });

  it('추천 이유를 렌더링한다', () => {
    render(<RecommendationCard recommendation={recommendation} />);
    expect(screen.getByText('봉준호 감독의 명작입니다.')).toBeInTheDocument();
  });

  it('contentType 태그를 렌더링한다', () => {
    render(<RecommendationCard recommendation={recommendation} />);
    expect(screen.getByText('영화')).toBeInTheDocument();
  });

  it('시리즈 contentType 태그를 올바르게 표시한다', () => {
    render(<RecommendationCard recommendation={{ ...recommendation, contentType: 'tv' }} />);
    expect(screen.getByText('시리즈')).toBeInTheDocument();
  });

  it('상세 페이지 링크가 올바르다', () => {
    render(<RecommendationCard recommendation={recommendation} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/contents/movie/496243');
  });

  it('보고싶어요 버튼을 클릭하면 API를 호출한다', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 1 } });

    render(<RecommendationCard recommendation={recommendation} />);
    const button = screen.getByLabelText('보고싶어요');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/watchlist', {
        tmdbId: 496243,
        contentType: 'movie',
        status: 'want_to_watch',
      });
    });
  });

  it('비로그인 상태에서 보고싶어요 클릭 시 로그인 모달을 연다', () => {
    mockUser = null;

    render(<RecommendationCard recommendation={recommendation} />);
    const button = screen.getByLabelText('보고싶어요');
    fireEvent.click(button);

    expect(mockOpenAuthModal).toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('포스터 이미지를 렌더링한다', () => {
    render(<RecommendationCard recommendation={recommendation} />);
    const img = screen.getByAltText('기생충');
    expect(img).toBeInTheDocument();
  });

  it('포스터가 없으면 대체 텍스트를 표시한다', () => {
    render(<RecommendationCard recommendation={{ ...recommendation, posterUrl: null }} />);
    expect(screen.getByText('포스터 없음')).toBeInTheDocument();
  });

  it('reason이 비어있으면 추천 이유를 렌더링하지 않는다', () => {
    render(<RecommendationCard recommendation={{ ...recommendation, reason: '' }} />);
    expect(screen.getByText('기생충')).toBeInTheDocument();
    // reason 단락이 렌더링되지 않아야 함
    const paragraphs = document.querySelectorAll('.text-white\\/50');
    expect(paragraphs).toHaveLength(0);
  });
});
