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
  useRouter: () => ({ push: vi.fn() }),
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

  it('미등록 상태에서 "기록하기"를 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });
  });

  it('상태가 want_to_watch일 때 "감상할 작품"을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'want_to_watch', watchlistId: 1 } });

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상할 작품')).toBeInTheDocument();
    });
  });

  it('상태가 watched일 때 "감상한 작품"을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'watched', watchlistId: 1 } });

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });
  });

  it('비로그인 상태에서 클릭 시 인증 모달을 열어야 한다', async () => {
    mockUser = null;
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await user.click(screen.getByText('기록하기'));
    expect(mockOpenAuthModal).toHaveBeenCalled();
  });

  it('미등록 상태에서 클릭 시 드롭다운 옵션을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });

    await user.click(screen.getByText('기록하기'));

    // 드롭다운에 "감상할 작품"과 "감상한 작품" 옵션이 나타남
    const dropdownItems = screen.getAllByText('감상할 작품');
    expect(dropdownItems.length).toBeGreaterThan(0);
    const watchedItems = screen.getAllByText('감상한 작품');
    expect(watchedItems.length).toBeGreaterThan(0);
  });

  it('want_to_watch 상태에서 "감상한 작품"과 "제거" 드롭다운을 표시해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'want_to_watch', watchlistId: 1 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

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

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상한 작품'));

    expect(screen.getByText('제거')).toBeInTheDocument();
  });

  it('미등록 상태에서 "감상할 작품" 클릭 시 POST API를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    mockPost.mockResolvedValue({ data: { id: 10 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });

    await user.click(screen.getByText('기록하기'));
    // 드롭다운에서 "감상할 작품" 클릭
    const options = screen.getAllByText('감상할 작품');
    await user.click(options[options.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/watchlist', expect.objectContaining({
        tmdbId: 123,
        contentType: 'movie',
        status: 'want_to_watch',
      }));
    });
  });

  it('watched 상태에서 "제거" 클릭 시 DELETE API를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'watched', watchlistId: 5 } });
    mockDelete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상한 작품'));
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

    render(<WatchlistStatusButton tmdbId={456} contentType="tv" />);

    await waitFor(() => {
      expect(screen.getByText('감상할 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상할 작품'));
    await user.click(screen.getByText('제거'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/watchlist/3');
    });
  });

  it('제거 후 상태가 미등록("기록하기")으로 변경되어야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'watched', watchlistId: 5 } });
    mockDelete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });

    await user.click(screen.getByText('감상한 작품'));
    await user.click(screen.getByText('제거'));

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });
  });

  it('로그인 상태에서 상태 조회 API를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });

    render(<WatchlistStatusButton tmdbId={999} contentType="tv" />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/watchlist/me/status?tmdbId=999&contentType=tv');
    });
  });

  it('비로그인 상태에서는 상태 조회 API를 호출하지 않아야 한다', () => {
    mockUser = null;

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('"감상할 작품"으로 추가 성공 시 watchlist_added 이벤트를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    mockPost.mockResolvedValue({ data: { id: 10 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });

    await user.click(screen.getByText('기록하기'));
    const options = screen.getAllByText('감상할 작품');
    await user.click(options[options.length - 1]);

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

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });

    await user.click(screen.getByText('기록하기'));
    const options = screen.getAllByText('감상할 작품');
    await user.click(options[options.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('tv 콘텐츠 추가 시 content_type이 tv로 이벤트를 호출해야 한다', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });
    mockPost.mockResolvedValue({ data: { id: 20 } });
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={456} contentType="tv" />);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });

    await user.click(screen.getByText('기록하기'));
    const options = screen.getAllByText('감상할 작품');
    await user.click(options[options.length - 1]);

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith('watchlist_added', {
        status: 'want_to_watch',
        content_type: 'tv',
      });
    });
  });
});
