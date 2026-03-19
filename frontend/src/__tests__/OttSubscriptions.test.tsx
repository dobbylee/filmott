import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OttSubscriptions from '@/components/profile/OttSubscriptions';

const mockUpdateUser = vi.fn();
let mockUser: Record<string, unknown> | null = {
  id: 1,
  nickname: 'testuser',
  subscribedOtts: ['netflix', 'tving'],
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    updateUser: mockUpdateUser,
  }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt as string} {...props} />
  ),
}));

const mockApiPatch = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    patch: (...args: unknown[]) => mockApiPatch(...args),
  },
}));

describe('OttSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 1,
      nickname: 'testuser',
      subscribedOtts: ['netflix', 'tving'],
    };
  });

  it('구독 중인 OTT를 표시해야 한다', () => {
    render(<OttSubscriptions />);

    expect(screen.getByText('구독 중인 OTT')).toBeInTheDocument();
    expect(screen.getByText('넷플릭스')).toBeInTheDocument();
    expect(screen.getByText('티빙')).toBeInTheDocument();
  });

  it('구독 정보가 없으면 안내 문구를 표시해야 한다', () => {
    mockUser = { id: 1, nickname: 'testuser', subscribedOtts: [] };
    render(<OttSubscriptions />);

    expect(screen.getByText('구독 중인 OTT가 없습니다')).toBeInTheDocument();
  });

  it('변경 버튼 클릭 시 편집 모드로 전환해야 한다', async () => {
    const user = userEvent.setup();
    render(<OttSubscriptions />);

    await user.click(screen.getByText('변경'));

    // 편집 모드에서 모든 OTT가 표시되어야 한다
    expect(screen.getByText('넷플릭스')).toBeInTheDocument();
    expect(screen.getByText('디즈니+')).toBeInTheDocument();
    expect(screen.getByText('왓챠')).toBeInTheDocument();
    expect(screen.getByText('웨이브')).toBeInTheDocument();
    expect(screen.getByText('쿠팡플레이')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  it('편집 모드에서 취소 버튼 클릭 시 보기 모드로 돌아가야 한다', async () => {
    const user = userEvent.setup();
    render(<OttSubscriptions />);

    await user.click(screen.getByText('변경'));
    await user.click(screen.getByText('취소'));

    expect(screen.getByText('변경')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
  });

  it('저장 시 PATCH /users/me/otts를 호출하고 updateUser를 실행해야 한다', async () => {
    const user = userEvent.setup();
    const updatedUser = {
      id: 1,
      nickname: 'testuser',
      subscribedOtts: ['netflix', 'tving', 'wavve'],
    };
    mockApiPatch.mockResolvedValue({ data: updatedUser });

    render(<OttSubscriptions />);

    await user.click(screen.getByText('변경'));

    // 웨이브 추가
    await user.click(screen.getByText('웨이브'));

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/users/me/otts', {
        otts: ['netflix', 'tving', 'wavve'],
      });
      expect(mockUpdateUser).toHaveBeenCalledWith(updatedUser);
    });
  });

  it('user가 null이면 아무것도 렌더링하지 않아야 한다', () => {
    mockUser = null;
    const { container } = render(<OttSubscriptions />);
    expect(container.innerHTML).toBe('');
  });
});
