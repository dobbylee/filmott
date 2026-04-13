import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnmatchedPosters from '@/components/admin/UnmatchedPosters';

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

const unmatchedData = [
  { id: 10, rank: 3, title: '매칭 안된 영화', category: 'daily-box-office', source: 'kobis' },
  { id: 20, rank: 7, title: '다른 미매칭', category: 'weekly-box-office', source: 'kobis' },
];

describe('UnmatchedPosters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('매칭 실패 항목 목록을 렌더링해야 한다', async () => {
    mockGet.mockResolvedValue({ data: unmatchedData });

    render(<UnmatchedPosters />);

    await waitFor(() => {
      expect(screen.getByText('매칭 안된 영화')).toBeInTheDocument();
      expect(screen.getByText('다른 미매칭')).toBeInTheDocument();
    });
    expect(screen.getByText('일별 박스오피스')).toBeInTheDocument();
    expect(screen.getByText('주간 박스오피스')).toBeInTheDocument();
  });

  it('매칭 실패 항목이 없을 때 안내 메시지를 표시해야 한다', async () => {
    mockGet.mockResolvedValue({ data: [] });

    render(<UnmatchedPosters />);

    await waitFor(() => {
      expect(screen.getByText('매칭 실패 항목이 없습니다.')).toBeInTheDocument();
    });
  });

  it('API 호출 실패 시 에러 메시지를 표시해야 한다', async () => {
    mockGet.mockRejectedValue(new Error('네트워크 오류'));

    render(<UnmatchedPosters />);

    await waitFor(() => {
      expect(screen.getByText('네트워크 오류')).toBeInTheDocument();
    });
  });

  it('저장 버튼 클릭 시 PATCH API를 호출해야 한다', async () => {
    mockGet.mockResolvedValue({ data: [unmatchedData[0]] });
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<UnmatchedPosters />);

    await waitFor(() => {
      expect(screen.getByText('매칭 안된 영화')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('포스터 URL을 입력하세요');
    await user.type(input, 'https://example.com/poster.jpg');

    const saveButton = screen.getByText('저장');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/rankings/10/poster', {
        posterUrl: 'https://example.com/poster.jpg',
      });
    });
  });

  it('저장 성공 시 "저장 완료" 메시지를 표시해야 한다', async () => {
    mockGet.mockResolvedValue({ data: [unmatchedData[0]] });
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<UnmatchedPosters />);

    await waitFor(() => {
      expect(screen.getByText('매칭 안된 영화')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('포스터 URL을 입력하세요');
    await user.type(input, 'https://example.com/poster.jpg');
    await user.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(screen.getByText('저장 완료')).toBeInTheDocument();
    });
  });

  it('저장 실패 시 에러 메시지를 표시해야 한다', async () => {
    mockGet.mockResolvedValue({ data: [unmatchedData[0]] });
    mockPatch.mockRejectedValue(new Error('저장 실패'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<UnmatchedPosters />);

    await waitFor(() => {
      expect(screen.getByText('매칭 안된 영화')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('포스터 URL을 입력하세요');
    await user.type(input, 'https://example.com/poster.jpg');
    await user.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(screen.getByText('저장 실패')).toBeInTheDocument();
    });
  });

  it('URL 미입력 시 저장 버튼이 비활성화되어야 한다', async () => {
    mockGet.mockResolvedValue({ data: [unmatchedData[0]] });

    render(<UnmatchedPosters />);

    await waitFor(() => {
      expect(screen.getByText('매칭 안된 영화')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('저장').closest('button');
    expect(saveButton).toBeDisabled();
  });

});
