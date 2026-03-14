import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserManagement from '@/components/admin/UserManagement';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: vi.fn(),
  },
}));

const mockUsersResponse = {
  users: [
    {
      id: 1,
      nickname: '어드민',
      email: 'admin@test.com',
      provider: 'local',
      status: 'ACTIVE',
      role: 'ADMIN',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      nickname: '일반유저',
      email: 'user@test.com',
      provider: 'kakao',
      status: 'ACTIVE',
      role: 'USER',
      createdAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 3,
      nickname: '정지유저',
      email: 'suspended@test.com',
      provider: 'naver',
      status: 'SUSPENDED',
      role: 'USER',
      createdAt: '2026-03-01T00:00:00.000Z',
    },
  ],
  total: 3,
  page: 1,
  totalPages: 1,
};

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('유저 목록을 정상적으로 렌더링해야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('어드민')).toBeInTheDocument();
      expect(screen.getByText('일반유저')).toBeInTheDocument();
      expect(screen.getByText('정지유저')).toBeInTheDocument();
    });

    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    // 테이블 헤더 "가입 방식"과 provider "이메일" 이 모두 존재
    expect(screen.getAllByText('이메일').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('카카오')).toBeInTheDocument();
    expect(screen.getByText('네이버')).toBeInTheDocument();
  });

  it('ADMIN 유저에는 "관리자" 텍스트를, USER에는 상태 변경 버튼을 표시해야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('어드민')).toBeInTheDocument();
    });

    // ADMIN 유저 행의 관리 칼럼에 "관리자" 표시
    expect(screen.getByText('관리자')).toBeInTheDocument();

    // ACTIVE USER에는 "정지" 버튼
    expect(screen.getByText('정지')).toBeInTheDocument();

    // SUSPENDED USER에는 "해제" 버튼
    expect(screen.getByText('해제')).toBeInTheDocument();
  });

  it('검색 시 API를 올바른 파라미터로 호출해야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });
    const user = userEvent.setup();

    render(<UserManagement />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    const searchInput = screen.getByPlaceholderText('닉네임 또는 이메일 검색');
    await user.type(searchInput, '테스트');
    await user.click(screen.getByRole('button', { name: '검색' }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('search=%ED%85%8C%EC%8A%A4%ED%8A%B8')
      );
    });
  });

  it('상태 필터 변경 시 API를 올바른 파라미터로 호출해야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });
    const user = userEvent.setup();

    render(<UserManagement />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'SUSPENDED');

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('status=SUSPENDED')
      );
    });
  });

  it('"정지" 버튼 클릭 시 확인 모달을 표시해야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });
    const user = userEvent.setup();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('정지')).toBeInTheDocument();
    });

    await user.click(screen.getByText('정지'));

    await waitFor(() => {
      expect(screen.getByText(/정말 "일반유저" 유저를 정지하시겠습니까\?/)).toBeInTheDocument();
    });
  });

  it('확인 모달에서 "정지" 확인 시 PATCH API를 호출해야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('정지')).toBeInTheDocument();
    });

    // 테이블의 "정지" 버튼 클릭
    const suspendButtons = screen.getAllByText('정지');
    await user.click(suspendButtons[0]);

    // 모달에서 확인 버튼 클릭
    await waitFor(() => {
      expect(screen.getByText(/정말 "일반유저" 유저를 정지하시겠습니까\?/)).toBeInTheDocument();
    });
    const modalSuspendButtons = screen.getAllByText('정지');
    // 마지막 "정지" 버튼이 모달의 확인 버튼
    await user.click(modalSuspendButtons[modalSuspendButtons.length - 1]);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/users/admin/2/status', {
        status: 'SUSPENDED',
      });
    });
  });

  it('"해제" 버튼 클릭 및 확인 시 PATCH API를 호출해야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('해제')).toBeInTheDocument();
    });

    await user.click(screen.getByText('해제'));

    await waitFor(() => {
      expect(screen.getByText(/정말 "정지유저" 유저의 정지를 해제하시겠습니까\?/)).toBeInTheDocument();
    });

    const modalReleaseButtons = screen.getAllByText('해제');
    await user.click(modalReleaseButtons[modalReleaseButtons.length - 1]);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/users/admin/3/status', {
        status: 'ACTIVE',
      });
    });
  });

  it('확인 모달에서 취소 버튼 클릭 시 모달을 닫아야 한다', async () => {
    mockGet.mockResolvedValue({ data: mockUsersResponse });
    const user = userEvent.setup();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('정지')).toBeInTheDocument();
    });

    await user.click(screen.getByText('정지'));

    await waitFor(() => {
      expect(screen.getByText('취소')).toBeInTheDocument();
    });

    await user.click(screen.getByText('취소'));

    await waitFor(() => {
      expect(screen.queryByText(/정말.*유저를 정지하시겠습니까/)).not.toBeInTheDocument();
    });
  });

  it('유저가 없을 때 "검색 결과가 없습니다" 메시지를 표시해야 한다', async () => {
    mockGet.mockResolvedValue({
      data: { users: [], total: 0, page: 1, totalPages: 0 },
    });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    });
  });

  it('API 에러 시 에러 메시지를 표시해야 한다', async () => {
    mockGet.mockRejectedValue(new Error('서버 오류'));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('서버 오류')).toBeInTheDocument();
    });
  });
});
