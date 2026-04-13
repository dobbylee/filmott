import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminTabs from '@/components/admin/AdminTabs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/components/admin/UserManagement', () => ({
  default: () => <h2>유저 관리</h2>,
}));

vi.mock('@/components/admin/RankingRefresh', () => ({
  default: () => <section>랭킹 갱신</section>,
}));

vi.mock('@/components/admin/UnmatchedPosters', () => ({
  default: () => <section>매칭 안 된 포스터</section>,
}));

vi.mock('@/components/admin/ContentManagement', () => ({
  default: () => <h2>콘텐츠 관리</h2>,
}));

describe('AdminTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3개 탭 버튼을 렌더링해야 한다', () => {
    render(<AdminTabs />);

    expect(screen.getByRole('button', { name: '유저 관리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '랭킹 관리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '콘텐츠 관리' })).toBeInTheDocument();
  });

  it('기본 탭은 유저 관리여야 한다', async () => {
    render(<AdminTabs />);

    // UserManagement의 제목이 보여야 한다
    await waitFor(() => {
      expect(screen.getByText('유저 관리', { selector: 'h2' })).toBeInTheDocument();
    });
  });

  it('랭킹 관리 탭 클릭 시 랭킹 관련 컴포넌트를 렌더링해야 한다', async () => {
    const user = userEvent.setup();
    render(<AdminTabs />);

    await user.click(screen.getByText('랭킹 관리', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('랭킹 갱신')).toBeInTheDocument();
    });
  });

  it('콘텐츠 관리 탭 클릭 시 콘텐츠 관리 컴포넌트를 렌더링해야 한다', async () => {
    const user = userEvent.setup();
    render(<AdminTabs />);

    await user.click(screen.getByText('콘텐츠 관리', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('콘텐츠 관리', { selector: 'h2' })).toBeInTheDocument();
    });
  });

  it('탭 전환 시 이전 탭의 콘텐츠가 사라져야 한다', async () => {
    const user = userEvent.setup();
    render(<AdminTabs />);

    // 기본: 유저 관리 탭
    await waitFor(() => {
      expect(screen.getByText('유저 관리', { selector: 'h2' })).toBeInTheDocument();
    });

    // 랭킹 관리로 전환
    await user.click(screen.getByText('랭킹 관리', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('랭킹 갱신')).toBeInTheDocument();
      expect(screen.queryByText('유저 관리', { selector: 'h2' })).not.toBeInTheDocument();
    });

    // 콘텐츠 관리로 전환
    await user.click(screen.getByText('콘텐츠 관리', { selector: 'button' }));

    await waitFor(() => {
      expect(screen.getByText('콘텐츠 관리', { selector: 'h2' })).toBeInTheDocument();
      expect(screen.queryByText('랭킹 갱신')).not.toBeInTheDocument();
    });
  });

  it('유저 관리 탭으로 돌아갈 수 있어야 한다', async () => {
    const user = userEvent.setup();
    render(<AdminTabs />);

    // 랭킹 관리로 전환
    await user.click(screen.getByText('랭킹 관리', { selector: 'button' }));
    await waitFor(() => {
      expect(screen.getByText('랭킹 갱신')).toBeInTheDocument();
    });

    // 유저 관리로 복귀
    await user.click(screen.getByText('유저 관리', { selector: 'button' }));
    await waitFor(() => {
      expect(screen.getByText('유저 관리', { selector: 'h2' })).toBeInTheDocument();
    });
  });
});
