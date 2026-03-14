import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import SignupPage from '@/app/(auth)/signup/page';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

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

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('비로그인 상태에서 소셜 로그인 모달을 열고 홈으로 리다이렉트한다', () => {
    render(<SignupPage />);

    expect(mockOpenAuthModal).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('로딩 스피너를 렌더링한다', () => {
    const { container } = render(<SignupPage />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('openAuthModal을 호출한다', () => {
    render(<SignupPage />);

    expect(mockOpenAuthModal).toHaveBeenCalledTimes(1);
  });
});
