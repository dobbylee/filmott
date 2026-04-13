import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdultBlockButton from '@/components/content/AdultBlockButton';

let mockUser: { nickname: string; role?: string } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    openAuthModal: vi.fn(),
    logout: vi.fn(),
    handleAuthSuccess: vi.fn(),
    token: null,
    isLoading: false,
    updateUser: vi.fn(),
    closeAuthModal: vi.fn(),
    authModal: { isOpen: false },
  }),
}));

const mockPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

describe('AdultBlockButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('비로그인 상태에서는 버튼을 표시하지 않아야 한다', () => {
    mockUser = null;

    const { container } = render(
      <AdultBlockButton tmdbId={123} contentType="movie" initialAdult={false} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('일반 유저일 때 버튼을 표시하지 않아야 한다', () => {
    mockUser = { nickname: 'user1', role: 'USER' };

    const { container } = render(
      <AdultBlockButton tmdbId={123} contentType="movie" initialAdult={false} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('ADMIN일 때 adult=false이면 "성인물 차단" 버튼을 표시해야 한다', () => {
    mockUser = { nickname: 'admin', role: 'ADMIN' };

    render(
      <AdultBlockButton tmdbId={123} contentType="movie" initialAdult={false} />,
    );

    expect(screen.getByText('성인물 차단')).toBeInTheDocument();
  });

  it('ADMIN일 때 adult=true이면 "차단 해제" 버튼을 표시해야 한다', () => {
    mockUser = { nickname: 'admin', role: 'ADMIN' };

    render(
      <AdultBlockButton tmdbId={123} contentType="movie" initialAdult={true} />,
    );

    expect(screen.getByText('차단 해제')).toBeInTheDocument();
  });

  it('차단 버튼 클릭 시 확인 모달을 표시해야 한다', async () => {
    mockUser = { nickname: 'admin', role: 'ADMIN' };
    const user = userEvent.setup();

    render(
      <AdultBlockButton tmdbId={123} contentType="movie" initialAdult={false} />,
    );

    await user.click(screen.getByText('성인물 차단'));

    expect(screen.getByText('이 작품을 성인물 차단하시겠습니까?')).toBeInTheDocument();
    expect(screen.getByText('확인')).toBeInTheDocument();
    expect(screen.getByText('취소')).toBeInTheDocument();
  });

  it('모달에서 확인 클릭 시 PATCH API를 호출해야 한다', async () => {
    mockUser = { nickname: 'admin', role: 'ADMIN' };
    mockPatch.mockResolvedValue({ data: { adult: true } });
    const user = userEvent.setup();

    render(
      <AdultBlockButton tmdbId={456} contentType="tv" initialAdult={false} />,
    );

    await user.click(screen.getByText('성인물 차단'));
    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/contents/adult', {
        tmdbId: 456,
        contentType: 'tv',
        adult: true,
      });
    });

    expect(screen.getByText('차단 해제')).toBeInTheDocument();
  });

  it('모달에서 취소 클릭 시 API를 호출하지 않아야 한다', async () => {
    mockUser = { nickname: 'admin', role: 'ADMIN' };
    const user = userEvent.setup();

    render(
      <AdultBlockButton tmdbId={123} contentType="movie" initialAdult={false} />,
    );

    await user.click(screen.getByText('성인물 차단'));
    await user.click(screen.getByText('취소'));

    expect(mockPatch).not.toHaveBeenCalled();
    // 모달이 닫히고 원래 버튼이 다시 보여야 한다
    expect(screen.queryByText('이 작품을 성인물 차단하시겠습니까?')).not.toBeInTheDocument();
  });

  it('API 실패 시 에러 메시지를 표시하고 상태를 변경하지 않아야 한다', async () => {
    mockUser = { nickname: 'admin', role: 'ADMIN' };
    mockPatch.mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();

    render(
      <AdultBlockButton tmdbId={123} contentType="movie" initialAdult={false} />,
    );

    await user.click(screen.getByText('성인물 차단'));
    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(screen.getByText('성인물 차단에 실패했습니다.')).toBeInTheDocument();
    });

    expect(screen.getByText('성인물 차단')).toBeInTheDocument();
  });
});
