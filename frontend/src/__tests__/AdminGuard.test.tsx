import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminGuard from '@/components/admin/AdminGuard';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

let mockUser: { nickname: string; role?: string } | null = null;
let mockIsLoading = false;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: mockIsLoading,
    logout: vi.fn(),
    handleAuthSuccess: vi.fn(),
    token: null,
    updateUser: vi.fn(),
    openAuthModal: vi.fn(),
    closeAuthModal: vi.fn(),
    authModal: { isOpen: false },
  }),
}));

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockIsLoading = false;
  });

  it('로딩 중일 때 스켈레톤을 표시해야 한다', () => {
    mockIsLoading = true;
    const { container } = render(
      <AdminGuard>
        <div>관리자 콘텐츠</div>
      </AdminGuard>
    );

    expect(screen.queryByText('관리자 콘텐츠')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('비로그인 상태에서 메인으로 리다이렉트해야 한다', () => {
    mockUser = null;
    render(
      <AdminGuard>
        <div>관리자 콘텐츠</div>
      </AdminGuard>
    );

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText('관리자 콘텐츠')).not.toBeInTheDocument();
  });

  it('일반 유저 접근 시 메인으로 리다이렉트해야 한다', () => {
    mockUser = { nickname: 'testuser', role: 'USER' };
    render(
      <AdminGuard>
        <div>관리자 콘텐츠</div>
      </AdminGuard>
    );

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(screen.queryByText('관리자 콘텐츠')).not.toBeInTheDocument();
  });

  it('ADMIN 유저 접근 시 children을 렌더링해야 한다', () => {
    mockUser = { nickname: 'admin', role: 'ADMIN' };
    render(
      <AdminGuard>
        <div>관리자 콘텐츠</div>
      </AdminGuard>
    );

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('관리자 콘텐츠')).toBeInTheDocument();
  });
});
