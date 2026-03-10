import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignupPage from '@/app/(auth)/signup/page';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignup = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signup: mockSignup,
    user: null,
    token: null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render signup form with all fields', () => {
    render(<SignupPage />);

    expect(screen.getByRole('heading', { name: '회원가입' })).toBeInTheDocument();
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('닉네임')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호 확인')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();
  });

  it('should show error when passwords do not match', async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText('이메일'), 'test@example.com');
    await user.type(screen.getByLabelText('닉네임'), 'testuser');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'different123');
    await user.click(screen.getByRole('button', { name: '회원가입' }));

    expect(screen.getByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('should call signup and redirect on success', async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText('이메일'), 'test@example.com');
    await user.type(screen.getByLabelText('닉네임'), 'testuser');
    await user.type(screen.getByLabelText('비밀번호'), 'password123');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'password123');
    await user.click(screen.getByRole('button', { name: '회원가입' }));

    expect(mockSignup).toHaveBeenCalledWith({
      email: 'test@example.com',
      nickname: 'testuser',
      password: 'password123',
    });
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
