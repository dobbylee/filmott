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
    signup: vi.fn(),
    user: null,
    token: null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    openAuthModal: mockOpenAuthModal,
    closeAuthModal: vi.fn(),
    authModal: null,
  }),
}));

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('비로그인 상태에서 회원가입 모달을 열고 홈으로 리다이렉트한다', () => {
    render(<SignupPage />);

    expect(mockOpenAuthModal).toHaveBeenCalledWith('signup');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('null을 렌더링한다 (UI 없음)', () => {
    const { container } = render(<SignupPage />);
    expect(container.firstChild).toBeNull();
  });

  it('openAuthModal을 정확한 인자로 호출한다', () => {
    render(<SignupPage />);

    expect(mockOpenAuthModal).toHaveBeenCalledTimes(1);
    expect(mockOpenAuthModal).toHaveBeenCalledWith('signup');
  });
});
