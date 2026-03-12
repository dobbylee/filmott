import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchlistStatusButton from '@/components/watchlist/WatchlistStatusButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockOpenAuthModal = vi.fn();
let mockUser: { nickname: string } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    openAuthModal: mockOpenAuthModal,
    logout: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    token: null,
    isLoading: false,
    updateUser: vi.fn(),
    closeAuthModal: vi.fn(),
    authModal: null,
  }),
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

  it('should show "기록하기" when not registered', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: null, watchlistId: null } });

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('기록하기')).toBeInTheDocument();
    });
  });

  it('should show "감상할 작품" when status is want_to_watch', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'want_to_watch', watchlistId: 1 } });

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상할 작품')).toBeInTheDocument();
    });
  });

  it('should show "감상한 작품" when status is watched', async () => {
    mockUser = { nickname: 'testuser' };
    mockGet.mockResolvedValue({ data: { status: 'watched', watchlistId: 1 } });

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await waitFor(() => {
      expect(screen.getByText('감상한 작품')).toBeInTheDocument();
    });
  });

  it('should open auth modal when clicking without login', async () => {
    mockUser = null;
    const user = userEvent.setup();

    render(<WatchlistStatusButton tmdbId={123} contentType="movie" />);

    await user.click(screen.getByText('기록하기'));
    expect(mockOpenAuthModal).toHaveBeenCalledWith('login');
  });

  it('should show dropdown options when not registered and clicked', async () => {
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

  it('should show dropdown with "감상한 작품" and "제거" for want_to_watch', async () => {
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

  it('should show dropdown with "제거" for watched', async () => {
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
});
