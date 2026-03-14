import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '@/components/auth/AuthModal';

const mockCloseAuthModal = vi.fn();
let mockIsOpen = false;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    isLoading: false,
    handleAuthSuccess: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    openAuthModal: vi.fn(),
    closeAuthModal: mockCloseAuthModal,
    authModal: { isOpen: mockIsOpen },
  }),
}));

// window.location.href mock
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  mockIsOpen = false;
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...originalLocation, href: '' },
  });
});

describe('AuthModal', () => {
  it('isOpen이 false일 때 렌더링하지 않는다', () => {
    mockIsOpen = false;
    const { container } = render(<AuthModal />);
    expect(container.innerHTML).toBe('');
  });

  it('isOpen이 true일 때 모달을 렌더링한다', () => {
    mockIsOpen = true;
    render(<AuthModal />);

    expect(screen.getByTestId('social-login-google')).toBeInTheDocument();
  });

  it('소셜 로그인 버튼 3개를 렌더링한다', () => {
    mockIsOpen = true;
    render(<AuthModal />);

    expect(screen.getByTestId('social-login-google')).toBeInTheDocument();
    expect(screen.getByTestId('social-login-kakao')).toBeInTheDocument();
    expect(screen.getByTestId('social-login-naver')).toBeInTheDocument();
  });

  it('각 소셜 버튼의 텍스트가 올바르다', () => {
    mockIsOpen = true;
    render(<AuthModal />);

    expect(screen.getByText('Google로 계속하기')).toBeInTheDocument();
    expect(screen.getByText('카카오로 계속하기')).toBeInTheDocument();
    expect(screen.getByText('네이버로 계속하기')).toBeInTheDocument();
  });

  it('Google 버튼 클릭 시 올바른 URL로 이동한다', async () => {
    mockIsOpen = true;
    const user = userEvent.setup();
    render(<AuthModal />);

    await user.click(screen.getByTestId('social-login-google'));
    expect(window.location.href).toContain('/auth/google');
  });

  it('Kakao 버튼 클릭 시 올바른 URL로 이동한다', async () => {
    mockIsOpen = true;
    const user = userEvent.setup();
    render(<AuthModal />);

    await user.click(screen.getByTestId('social-login-kakao'));
    expect(window.location.href).toContain('/auth/kakao');
  });

  it('Naver 버튼 클릭 시 올바른 URL로 이동한다', async () => {
    mockIsOpen = true;
    const user = userEvent.setup();
    render(<AuthModal />);

    await user.click(screen.getByTestId('social-login-naver'));
    expect(window.location.href).toContain('/auth/naver');
  });

  it('닫기 버튼 클릭 시 closeAuthModal을 호출한다', async () => {
    mockIsOpen = true;
    const user = userEvent.setup();
    render(<AuthModal />);

    await user.click(screen.getByLabelText('닫기'));
    expect(mockCloseAuthModal).toHaveBeenCalled();
  });

  it('배경 클릭 시 closeAuthModal을 호출한다', async () => {
    mockIsOpen = true;
    const user = userEvent.setup();
    render(<AuthModal />);

    // 배경 (backdrop) 클릭 - 모달 외부 영역
    const backdrop = screen.getByTestId('social-login-google').closest('.fixed');
    if (backdrop) {
      await user.click(backdrop);
      expect(mockCloseAuthModal).toHaveBeenCalled();
    }
  });
});
