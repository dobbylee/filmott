import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchlistCard from '@/components/watchlist/WatchlistCard';
import type { WatchlistItem } from '@/types/watchlist';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, nickname: 'test' },
    isLoading: false,
    openAuthModal: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: { data: [], total: 0, page: 1, totalPages: 1 },
    }),
    post: vi.fn().mockResolvedValue({ data: { liked: true, likesCount: 1 } }),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

const baseContent = {
  id: 1,
  tmdbId: 123,
  contentType: 'movie' as const,
  title: '인셉션',
  posterUrl: '/poster.jpg',
  releaseDate: '2010-07-16',
  genres: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const watchedItemWithReview: WatchlistItem = {
  id: 1,
  userId: 1,
  contentId: 1,
  status: 'watched',
  watchedAt: '2026-03-10T00:00:00Z',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-10T00:00:00Z',
  content: baseContent,
  review: {
    id: 1,
    userId: 1,
    contentId: 1,
    rating: 4.5,
    comment: '최고의 SF 영화',
    likesCount: 0,
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
};

const watchedItemWithoutReview: WatchlistItem = {
  id: 3,
  userId: 1,
  contentId: 3,
  status: 'watched',
  watchedAt: '2026-03-15T00:00:00Z',
  createdAt: '2026-03-15T00:00:00Z',
  updatedAt: '2026-03-15T00:00:00Z',
  content: {
    ...baseContent,
    id: 3,
    tmdbId: 789,
    title: '다크 나이트',
  },
};

const wantToWatchItem: WatchlistItem = {
  id: 2,
  userId: 1,
  contentId: 2,
  status: 'want_to_watch',
  watchedAt: null,
  createdAt: '2026-03-05T00:00:00Z',
  updatedAt: '2026-03-05T00:00:00Z',
  content: {
    ...baseContent,
    id: 2,
    tmdbId: 456,
    contentType: 'tv',
    title: '브레이킹 배드',
    releaseDate: '2008-01-20',
  },
};

describe('WatchlistCard', () => {
  describe('리뷰가 있는 감상한 작품', () => {
    it('제목과 포스터를 렌더링한다', () => {
      render(<WatchlistCard item={watchedItemWithReview} />);

      expect(screen.getByText('인셉션')).toBeInTheDocument();
      const img = screen.getByAltText('인셉션');
      expect(img).toBeInTheDocument();
    });

    it('평점과 코멘트를 렌더링한다', () => {
      render(<WatchlistCard item={watchedItemWithReview} />);

      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('최고의 SF 영화')).toBeInTheDocument();
    });

    it('작품 유형과 개봉 연도를 렌더링한다', () => {
      render(<WatchlistCard item={watchedItemWithReview} />);

      // span 안에 "영화"와 "· 2010"이 별도 텍스트 노드로 렌더링됨
      // '최고의 SF 영화' 코멘트와 구분하기 위해 exact match 사용
      const typeYearSpans = screen.getAllByText(/영화/);
      const typeYearSpan = typeYearSpans.find((el) =>
        el.textContent?.includes('2010')
      );
      expect(typeYearSpan).toBeDefined();
      expect(typeYearSpan?.textContent).toContain('영화');
      expect(typeYearSpan?.textContent).toContain('2010');
    });

    it('watchedAt에서 감상일 숫자를 렌더링한다', () => {
      render(<WatchlistCard item={watchedItemWithReview} />);

      // watchedAt: '2026-03-10' → day = 10
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('좋아요 버튼을 렌더링한다', () => {
      render(<WatchlistCard item={watchedItemWithReview} />);

      expect(screen.getByRole('button', { name: /좋아요/ })).toBeInTheDocument();
    });

    it('작품 상세 페이지로 링크한다', () => {
      render(<WatchlistCard item={watchedItemWithReview} />);

      const links = screen.getAllByRole('link');
      const contentLinks = links.filter(
        (link) => link.getAttribute('href') === '/contents/movie/123'
      );
      expect(contentLinks.length).toBeGreaterThan(0);
    });

    it('댓글 버튼 클릭 시 댓글 모달을 열어야 한다', async () => {
      const user = userEvent.setup();
      render(<WatchlistCard item={watchedItemWithReview} />);

      // 댓글 버튼 — title 속성이 없고(날짜 수정 버튼 제외) SVG를 포함한 버튼
      const buttons = screen.getAllByRole('button');
      const commentButton = buttons.find(
        (btn) =>
          !btn.getAttribute('aria-label') &&
          !btn.getAttribute('title') &&
          btn.querySelector('svg') !== null
      );
      expect(commentButton).toBeDefined();
      await user.click(commentButton!);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: '댓글' })).toBeInTheDocument();
      });
    });
  });

  describe('리뷰가 없는 감상한 작품', () => {
    it('"리뷰 작성" 버튼을 렌더링한다', () => {
      render(<WatchlistCard item={watchedItemWithoutReview} />);

      expect(screen.getByText('리뷰 작성')).toBeInTheDocument();
    });

    it('평점과 코멘트를 렌더링하지 않는다', () => {
      render(<WatchlistCard item={watchedItemWithoutReview} />);

      // 리뷰가 없으므로 평점 수치가 없어야 함
      expect(screen.queryByText('4.5')).not.toBeInTheDocument();
    });

    it('"리뷰 작성" 클릭 시 리뷰 폼 모달을 열어야 한다', async () => {
      const user = userEvent.setup();
      render(<WatchlistCard item={watchedItemWithoutReview} />);

      await user.click(screen.getByText('리뷰 작성'));

      await waitFor(() => {
        // ReviewFormModal 헤더 h2
        expect(screen.getAllByText('리뷰 작성').length).toBeGreaterThan(0);
        // 별점 레이블
        expect(screen.getByText('별점')).toBeInTheDocument();
        expect(screen.getByText('감상 날짜')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('2026-03-15')).toBeInTheDocument();
    });

    it('날짜 영역 클릭 시 같은 리뷰 작성 모달을 열고 watchedAt을 기본값으로 사용한다', async () => {
      const user = userEvent.setup();
      render(<WatchlistCard item={watchedItemWithoutReview} />);

      await user.click(screen.getByTitle('감상 기록 수정'));

      expect(screen.getByText('별점')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2026-03-15')).toBeInTheDocument();
    });
  });

  describe('리뷰가 있는 감상 기록 수정', () => {
    it('날짜 영역 클릭 시 리뷰 수정 모달을 열고 watchedAt을 기본값으로 사용한다', async () => {
      const user = userEvent.setup();
      render(<WatchlistCard item={watchedItemWithReview} />);

      await user.click(screen.getByTitle('감상 기록 수정'));

      expect(screen.getByText('리뷰 수정')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2026-03-10')).toBeInTheDocument();
    });

    it('좋아요 후 수정 모달을 열면 최신 좋아요 수로 초기화 경고를 표시해야 한다', async () => {
      const user = userEvent.setup();
      render(<WatchlistCard item={watchedItemWithReview} />);

      const likeButton = screen.getByRole('button', { name: '좋아요' });
      await user.click(likeButton);

      await waitFor(() => {
        expect(likeButton).toHaveTextContent('1');
      });

      await user.click(screen.getByTitle('감상 기록 수정'));
      fireEvent.change(screen.getByRole('slider', { name: '별점 선택' }), {
        target: { value: '8' },
      });

      expect(screen.getByText(/좋아요\(1개\) 초기화/)).toBeInTheDocument();
    });
  });

  describe('감상할 작품', () => {
    it('제목을 렌더링한다', () => {
      render(<WatchlistCard item={wantToWatchItem} />);

      expect(screen.getByText('브레이킹 배드')).toBeInTheDocument();
    });

    it('작품 상세 페이지로 링크한다', () => {
      render(<WatchlistCard item={wantToWatchItem} />);

      const links = screen.getAllByRole('link');
      const contentLinks = links.filter(
        (link) => link.getAttribute('href') === '/contents/tv/456'
      );
      expect(contentLinks.length).toBeGreaterThan(0);
    });

    it('리뷰 섹션을 렌더링하지 않는다', () => {
      render(<WatchlistCard item={wantToWatchItem} />);

      // want_to_watch 상태는 평점, 리뷰 작성 버튼 모두 렌더링하지 않음
      expect(screen.queryByText('리뷰 작성')).not.toBeInTheDocument();
    });

    it('감상일 숫자를 렌더링하지 않는다 (watchedAt이 null)', () => {
      render(<WatchlistCard item={wantToWatchItem} />);

      // watched 전용 day 렌더링 블록은 want_to_watch에 없음
      // 숫자만 단독으로 있는 큰 텍스트가 없어야 함
      const dayEl = screen.queryByText(/^\d{1,2}$/);
      expect(dayEl).not.toBeInTheDocument();
    });
  });
});
