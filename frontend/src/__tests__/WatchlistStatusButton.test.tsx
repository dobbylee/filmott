import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchlistStatusButton from '@/components/watchlist/WatchlistStatusButton';
import { createMockAuth } from './helpers/mockAuthContext';

const mockTrackEvent = vi.fn();
vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mockOpenAuthModal = vi.fn();
let mockUser: { nickname: string } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => createMockAuth({ user: mockUser, openAuthModal: mockOpenAuthModal }),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

describe('WatchlistStatusButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('미등록 상태에서 두 기록 행동을 직접 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
        '봤어요 · 별점 남기기',
        '보고 싶어요',
      ]);
    });
  });

  it('상태가 want_to_watch일 때 "감상할 작품"을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'want_to_watch', watchlistId: 1 } });

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상할 작품')).toBeInTheDocument();
    });
  });

  it('상태가 watched일 때 "감상한 작품"을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'watched', watchlistId: 1 } });

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });
  });

  it('비로그인 상태에서 "보고 싶어요" 클릭 시 행동을 유지한 인증 모달을 열어야 한다', async () => {
    mockUser = null;
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await user.click(screen.getByRole('button', { name: '보고 싶어요' }));
    expect(mockOpenAuthModal).toHaveBeenCalledWith('want_to_watch');
    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'want_to_watch',
      content_type: 'movie',
      tmdb_id: 123,
      authenticated: 0,
    });
    expect(mockTrackEvent).toHaveBeenCalledWith('login_prompt_shown', {
      source: 'content_detail',
      action: 'want_to_watch',
      content_type: 'movie',
      tmdb_id: 123,
    });
  });

  it('비로그인 상태에서 "봤어요 · 별점 남기기" 클릭 시 행동을 유지한 인증 모달을 열어야 한다', async () => {
    mockUser = null;
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await user.click(
      screen.getByRole('button', { name: '봤어요 · 별점 남기기' }),
    );
    expect(mockOpenAuthModal).toHaveBeenCalledWith('watched');
    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'watched',
      content_type: 'movie',
      tmdb_id: 123,
      authenticated: 0,
    });
    expect(mockTrackEvent).toHaveBeenCalledWith('login_prompt_shown', {
      source: 'content_detail',
      action: 'watched',
      content_type: 'movie',
      tmdb_id: 123,
    });
  });

  it('want_to_watch 상태에서 "감상한 작품"과 "제거" 드롭다운을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'want_to_watch', watchlistId: 1 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상할 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상할 작품'));

    // 드롭다운에 "감상한 작품"(전환) 버튼과 "제거" 버튼이 나타남
    const watchedItems = screen.getAllByText('감상한 작품');
    expect(watchedItems.length).toBeGreaterThan(0);
    expect(screen.getByText('제거')).toBeInTheDocument();
  });

  it('watched 상태에서 "제거" 드롭다운을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'watched', watchlistId: 1 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상한 작품'));

    expect(screen.getByText('제거')).toBeInTheDocument();
  });

  it('미등록 상태에서 "보고 싶어요" 클릭 시 POST API를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    mockPost.mockResolvedValue({ data: { id: 10 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '보고 싶어요' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '보고 싶어요' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/watchlist', expect.objectContaining({
        tmdbId: 123,
        contentType: 'movie',
        status: 'want_to_watch',
      }));
    });
    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'want_to_watch',
      content_type: 'movie',
      tmdb_id: 123,
      authenticated: 1,
    });
  });

  it('미등록 상태에서 "봤어요 · 별점 남기기" 클릭 시 리뷰 작성 모달을 열어야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={11} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '봤어요 · 별점 남기기' }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: '봤어요 · 별점 남기기' }),
    );

    await waitFor(() => {
      expect(screen.getByText('감상 날짜')).toBeInTheDocument();
      expect(screen.getByText('별점')).toBeInTheDocument();
    });
    expect(mockTrackEvent).toHaveBeenCalledWith('detail_action_clicked', {
      action: 'watched',
      content_type: 'movie',
      tmdb_id: 123,
      authenticated: 1,
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('기존 리뷰가 있으면 감상한 작품 재기록 시 리뷰 수정 모달을 열어야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/watchlist/me/status')) {
        return Promise.resolve({ data: { status: null, watchlistId: null } });
      }
      if (url.startsWith('/reviews/my')) {
        return Promise.resolve({
          data: {
            id: 77,
            userId: 1,
            contentId: 11,
            rating: 8,
            comment: '기존 리뷰',
            likesCount: 2,
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        });
      }
      return Promise.resolve({ data: null });
    });
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={11} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '봤어요 · 별점 남기기' }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: '봤어요 · 별점 남기기' }),
    );

    await waitFor(() => {
      expect(screen.getByText('리뷰 수정')).toBeInTheDocument();
    });

    await user.click(screen.getByText('수정'));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        '/reviews/77',
        expect.objectContaining({
          rating: 8,
          comment: '기존 리뷰',
        }),
      );
    });
    expect(mockPost).not.toHaveBeenCalledWith('/reviews', expect.anything());
  });

  it('watched 상태에서 "제거" 클릭 시 DELETE API를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'watched', watchlistId: 5 } });
    mockDelete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상한 작품'));
    await user.click(screen.getByText('제거'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/watchlist/5');
    });
  });

  it('watched 상태에서 리뷰가 있으면 제거 전 리뷰 삭제 확인을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/watchlist/me/status')) {
        return Promise.resolve({ data: { status: 'watched', watchlistId: 5 } });
      }
      if (url.startsWith('/reviews/my')) {
        return Promise.resolve({
          data: {
            id: 77,
            userId: 1,
            contentId: 1,
            rating: 8,
            comment: '기존 리뷰',
            likesCount: 2,
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        });
      }
      return Promise.resolve({ data: null });
    });
    mockDelete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상한 작품'));
    await user.click(screen.getByText('제거'));

    await waitFor(() => {
      expect(screen.getByText('리뷰도 함께 삭제돼요')).toBeInTheDocument();
    });
    expect(screen.getByText((_content, element) => (
      element?.tagName.toLowerCase() === 'p'
        && element.textContent === '감상한 작품 기록을 삭제하면리뷰와 댓글도 함께 삭제됩니다.'
    ))).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();

    await user.click(screen.getByText('제거'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/watchlist/5');
    });
  });

  it('want_to_watch 상태에서 "제거" 클릭 시 DELETE API를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'want_to_watch', watchlistId: 3 } });
    mockDelete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={2} tmdbId={456} contentType="tv" />);

    await waitFor(() => {
      expect(screen.getByText('감상할 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상할 작품'));
    await user.click(screen.getByText('제거'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/watchlist/3');
    });
  });

  it('제거 후 상태가 미등록 직접 행동으로 변경되어야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    let removed = false;
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/reviews/my')) {
        return Promise.resolve({ data: null });
      }
      return Promise.resolve({
        data: removed
          ? { status: null, watchlistId: null }
          : { status: 'watched', watchlistId: 5 },
      });
    });
    mockDelete.mockImplementation(() => {
      removed = true;
      return Promise.resolve({ data: {} });
    });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상한 작품'));
    await user.click(screen.getByText('제거'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '보고 싶어요' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '봤어요 · 별점 남기기' }),
      ).toBeInTheDocument();
    });
  });

  it('로그인 상태에서 상태 조회 API를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });

    render(<WatchlistStatusButton contentId={1} tmdbId={999} contentType="tv" />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/watchlist/me/status?tmdbId=999&contentType=tv');
    });
  });

  it('비로그인 상태에서는 상태 조회 API를 호출하지 않아야 한다', () => {
    mockUser = null;

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('"보고 싶어요"로 추가 성공 시 watchlist_added 이벤트를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    mockPost.mockResolvedValue({ data: { id: 10 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '보고 싶어요' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '보고 싶어요' }));

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith('watchlist_added', {
        status: 'want_to_watch',
        content_type: 'movie',
      });
    });
  });

  it('POST 실패 시 watchlist_added 이벤트를 호출하지 않아야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    mockPost.mockRejectedValue(new Error('서버 오류'));
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={1} tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '보고 싶어요' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '보고 싶어요' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '보고 싶어요' })).toBeEnabled();
    });

    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'watchlist_added',
      expect.anything(),
    );
  });

  it('tv 콘텐츠 추가 시 content_type이 tv로 이벤트를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    mockPost.mockResolvedValue({ data: { id: 20 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton contentId={2} tmdbId={456} contentType="tv" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '보고 싶어요' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '보고 싶어요' }));

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith('watchlist_added', {
        status: 'want_to_watch',
        content_type: 'tv',
      });
    });
  });
});
