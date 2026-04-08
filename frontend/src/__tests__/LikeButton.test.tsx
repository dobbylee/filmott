import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LikeButton from '@/components/review/LikeButton';
import { createMockAuth } from './helpers/mockAuthContext';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockOpenAuthModal = vi.fn();
let mockUser: { id: number; nickname: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => createMockAuth({ user: mockUser, openAuthModal: mockOpenAuthModal }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { liked: true, likesCount: 6 } }),
  },
}));

describe('LikeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('좋아요 카운트를 표시한다', () => {
    render(<LikeButton reviewId={1} initialCount={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('미로그인 시 클릭하면 인증 모달을 연다', async () => {
    const user = userEvent.setup();
    render(<LikeButton reviewId={1} initialCount={5} />);

    await user.click(screen.getByRole('button'));
    expect(mockOpenAuthModal).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('로그인 시 클릭하면 낙관적 업데이트를 수행한다', async () => {
    mockUser = { id: 1, nickname: '테스트' };
    const user = userEvent.setup();
    render(<LikeButton reviewId={1} initialCount={5} />);

    await user.click(screen.getByRole('button'));
    // 낙관적 업데이트 후 서버 응답으로 6
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
