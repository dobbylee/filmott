import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '@/components/layout/Header';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockLogout = vi.fn();
let mockUser: { nickname: string } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
    login: vi.fn(),
    signup: vi.fn(),
    token: null,
    isLoading: false,
    updateUser: vi.fn(),
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('should render logo and login button when not authenticated', () => {
    render(<Header />);

    expect(screen.getByText((_, el) => el?.textContent === 'filmott')).toBeInTheDocument();
    expect(screen.getByText('로그인')).toBeInTheDocument();
  });

  it('should show user nickname when authenticated', () => {
    mockUser = { nickname: 'testuser' };

    render(<Header />);

    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.queryByText('로그인')).not.toBeInTheDocument();
  });

  it('should show dropdown menu when user button clicked', async () => {
    mockUser = { nickname: 'testuser' };
    const user = userEvent.setup();

    render(<Header />);

    await user.click(screen.getByText('testuser'));
    expect(screen.getByText('프로필 설정')).toBeInTheDocument();
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
  });

  it('should handle search form submission', async () => {
    const user = userEvent.setup();

    render(<Header />);

    // 검색 아이콘 클릭으로 검색창 열기
    const searchButton = screen.getByLabelText('검색');
    await user.click(searchButton);

    const searchInput = screen.getByPlaceholderText('작품 / 인물');
    await user.type(searchInput, '인셉션{enter}');

    expect(mockPush).toHaveBeenCalledWith('/search?q=%EC%9D%B8%EC%85%89%EC%85%98');
  });
});
