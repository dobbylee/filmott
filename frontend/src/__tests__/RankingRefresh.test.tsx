import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RankingRefresh from '@/components/admin/RankingRefresh';

const mockPost = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('RankingRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('4개 카테고리 버튼을 렌더링해야 한다', () => {
    render(<RankingRefresh />);

    expect(screen.getByText('일별 박스오피스')).toBeInTheDocument();
    expect(screen.getByText('주간 박스오피스')).toBeInTheDocument();
    expect(screen.getByText('트렌딩 일간')).toBeInTheDocument();
    expect(screen.getByText('트렌딩 주간')).toBeInTheDocument();
  });

  it('버튼 클릭 시 올바른 API 엔드포인트를 호출해야 한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<RankingRefresh />);

    await user.click(screen.getByText('일별 박스오피스'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/rankings/refresh/daily-box-office');
    });
  });

  it('성공 시 "갱신 완료" 메시지를 표시해야 한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<RankingRefresh />);

    await user.click(screen.getByText('주간 박스오피스'));

    await waitFor(() => {
      expect(screen.getByText('갱신 완료')).toBeInTheDocument();
    });
  });

  it('실패 시 에러 메시지를 표시해야 한다', async () => {
    mockPost.mockRejectedValue(new Error('갱신 실패'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<RankingRefresh />);

    await user.click(screen.getByText('트렌딩 일간'));

    await waitFor(() => {
      expect(screen.getByText('갱신 실패')).toBeInTheDocument();
    });
  });

  it('로딩 중 버튼이 비활성화되어야 한다', async () => {
    let resolvePost: (value: { data: Record<string, never> }) => void;
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      })
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<RankingRefresh />);

    await user.click(screen.getByText('트렌딩 주간'));

    // 로딩 중일 때 버튼이 disabled
    const button = screen.getByText('트렌딩 주간').closest('button');
    expect(button).toBeDisabled();

    // resolve하여 로딩 종료
    resolvePost!({ data: {} });

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('각 카테고리별 API 경로가 올바른지 확인해야 한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<RankingRefresh />);

    await user.click(screen.getByText('일별 박스오피스'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/rankings/refresh/daily-box-office');
    });

    await user.click(screen.getByText('주간 박스오피스'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/rankings/refresh/weekly-box-office');
    });

    await user.click(screen.getByText('트렌딩 일간'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/rankings/refresh/trending-all-day');
    });

    await user.click(screen.getByText('트렌딩 주간'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/rankings/refresh/trending-all-week');
    });
  });
});
