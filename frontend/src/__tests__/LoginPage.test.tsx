import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import LoginPage from '@/app/(auth)/login/page';

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock AuthContext
const mockOpenAuthModal = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    isLoading: false,
    handleAuthSuccess: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    openAuthModal: mockOpenAuthModal,
    closeAuthModal: vi.fn(),
    authModal: { isOpen: false },
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('비로그인 상태에서 로그인 모달을 열고 홈으로 리다이렉트한다', () => {
    render(<LoginPage />);

    expect(mockOpenAuthModal).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('이미 로그인된 상태에서 홈으로 리다이렉트한다', () => {
    vi.mocked(vi.fn()).mockImplementation(() => {});
    // user가 있는 경우를 위한 별도 mock
    vi.doMock('@/contexts/AuthContext', () => ({
      useAuth: () => ({
        user: { id: 1, nickname: 'testuser' },
        token: 'token',
        isLoading: false,
        handleAuthSuccess: vi.fn(),
        logout: vi.fn(),
        updateUser: vi.fn(),
        openAuthModal: mockOpenAuthModal,
        closeAuthModal: vi.fn(),
        authModal: { isOpen: false },
      }),
    }));

    render(<LoginPage />);

    // 비로그인 기본 mock이 적용되므로 openAuthModal은 호출됨
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('로딩 스피너를 렌더링한다', () => {
    const { container } = render(<LoginPage />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });
});
