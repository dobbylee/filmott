import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLoginPage from '@/app/admin/login/page';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockHandleAuthSuccess = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    handleAuthSuccess: mockHandleAuthSuccess,
    user: null,
    token: null,
    isLoading: false,
    logout: vi.fn(),
    updateUser: vi.fn(),
    openAuthModal: vi.fn(),
    closeAuthModal: vi.fn(),
    authModal: { isOpen: false },
  }),
}));

const mockPost = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('AdminLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('로그인 성공 시 /admin으로 리다이렉트해야 한다', async () => {
    const authResponse = {
      user: { id: 1, nickname: 'admin', role: 'ADMIN' },
    };
    mockPost.mockResolvedValue({ data: authResponse });
    const user = userEvent.setup();

    render(<AdminLoginPage />);

    await user.type(screen.getByPlaceholderText('이메일'), 'admin@test.com');
    await user.type(screen.getByPlaceholderText('비밀번호'), 'password123');
    await user.click(screen.getByText('로그인'));

    await waitFor(() => {
      expect(mockHandleAuthSuccess).toHaveBeenCalledWith(authResponse);
      expect(mockReplace).toHaveBeenCalledWith('/admin');
    });
  });

  it('로그인 실패 시 에러 메시지를 표시해야 한다', async () => {
    mockPost.mockRejectedValue(new Error('Login failed'));
    const user = userEvent.setup();

    render(<AdminLoginPage />);

    await user.type(screen.getByPlaceholderText('이메일'), 'wrong@test.com');
    await user.type(screen.getByPlaceholderText('비밀번호'), 'wrongpass');
    await user.click(screen.getByText('로그인'));

    await waitFor(() => {
      expect(screen.getByText('로그인에 실패했습니다.')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
