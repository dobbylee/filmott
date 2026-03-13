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
const mockOpenAuthModal = vi.fn();
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
    openAuthModal: mockOpenAuthModal,
    closeAuthModal: vi.fn(),
    authModal: null,
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('비인증 상태에서 로고와 로그인 버튼을 렌더링해야 한다', () => {
    render(<Header />);

    const logoLinks = screen.getAllByText((_, el) => el?.textContent === 'filmott');
    expect(logoLinks.length).toBeGreaterThan(0);
    expect(screen.getByText('로그인')).toBeInTheDocument();
  });

  it('인증 상태에서 닉네임을 /profile 링크로 표시해야 한다', () => {
    mockUser = { nickname: 'testuser' };

    render(<Header />);

    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.queryByText('로그인')).not.toBeInTheDocument();

    // Avatar/nickname should be a link to /profile, not a button with dropdown
    const profileLink = screen.getByText('testuser').closest('a');
    expect(profileLink).toHaveAttribute('href', '/profile');
  });

  it('사용자 영역 클릭 시 드롭다운 메뉴를 표시하지 않아야 한다 (링크 방식)', () => {
    mockUser = { nickname: 'testuser' };

    render(<Header />);

    // No dropdown elements should exist
    expect(screen.queryByText('프로필 설정')).not.toBeInTheDocument();
    expect(screen.queryByText('로그아웃')).not.toBeInTheDocument();
  });

  it('검색 폼 제출을 처리해야 한다', async () => {
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
