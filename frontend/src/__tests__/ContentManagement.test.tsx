import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContentManagement from '@/components/admin/ContentManagement';

const mockPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: vi.fn(),
  },
}));

describe('ContentManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('타입 셀렉트와 TMDB ID 입력 필드를 렌더링해야 한다', () => {
    render(<ContentManagement />);

    expect(screen.getByLabelText('타입')).toBeInTheDocument();
    expect(screen.getByLabelText('TMDB ID')).toBeInTheDocument();
    expect(screen.getByText('차단')).toBeInTheDocument();
    expect(screen.getByText('해제')).toBeInTheDocument();
  });

  it('TMDB ID 없이 차단 버튼 클릭 시 에러 메시지를 표시해야 한다', async () => {
    const user = userEvent.setup();
    render(<ContentManagement />);

    await user.click(screen.getByText('차단'));

    expect(screen.getByText('TMDB ID를 입력해주세요.')).toBeInTheDocument();
  });

  it('TMDB ID 없이 해제 버튼 클릭 시 에러 메시지를 표시해야 한다', async () => {
    const user = userEvent.setup();
    render(<ContentManagement />);

    await user.click(screen.getByText('해제'));

    expect(screen.getByText('TMDB ID를 입력해주세요.')).toBeInTheDocument();
  });

  it('차단 버튼 클릭 시 확인 모달을 표시해야 한다', async () => {
    const user = userEvent.setup();
    render(<ContentManagement />);

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '12345');
    await user.click(screen.getByText('차단'));

    expect(screen.getByText('성인물 차단')).toBeInTheDocument();
    expect(screen.getByText(/영화 #12345을\(를\) 성인물로 차단하시겠습니까\?/)).toBeInTheDocument();
  });

  it('해제 버튼 클릭 시 확인 모달을 표시해야 한다', async () => {
    const user = userEvent.setup();
    render(<ContentManagement />);

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '12345');
    await user.click(screen.getByText('해제'));

    expect(screen.getByText('차단 해제')).toBeInTheDocument();
    expect(screen.getByText(/영화 #12345의 성인물 차단을 해제하시겠습니까\?/)).toBeInTheDocument();
  });

  it('확인 모달에서 확인 클릭 시 차단 API를 호출해야 한다', async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ContentManagement />);

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '12345');
    await user.click(screen.getByText('차단'));

    // 모달에서 확인 클릭
    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/contents/adult', {
        tmdbId: 12345,
        contentType: 'movie',
        adult: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('영화 #12345 성인물 차단 완료')).toBeInTheDocument();
    });
  });

  it('확인 모달에서 확인 클릭 시 해제 API를 호출해야 한다', async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ContentManagement />);

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '67890');
    await user.click(screen.getByText('해제'));

    // 모달에서 확인 클릭
    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/contents/adult', {
        tmdbId: 67890,
        contentType: 'movie',
        adult: false,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('영화 #67890 차단 해제 완료')).toBeInTheDocument();
    });
  });

  it('TV 타입 선택 후 차단 시 올바른 파라미터로 API를 호출해야 한다', async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ContentManagement />);

    const typeSelect = screen.getByLabelText('타입');
    await user.selectOptions(typeSelect, 'tv');

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '999');
    await user.click(screen.getByText('차단'));

    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/contents/adult', {
        tmdbId: 999,
        contentType: 'tv',
        adult: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('TV #999 성인물 차단 완료')).toBeInTheDocument();
    });
  });

  it('확인 모달에서 취소 클릭 시 모달을 닫아야 한다', async () => {
    const user = userEvent.setup();
    render(<ContentManagement />);

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '12345');
    await user.click(screen.getByText('차단'));

    // 모달이 열림
    expect(screen.getByText('성인물 차단')).toBeInTheDocument();

    // 취소 클릭
    await user.click(screen.getByText('취소'));

    // 모달이 닫힘
    await waitFor(() => {
      expect(screen.queryByText('성인물 차단')).not.toBeInTheDocument();
    });
  });

  it('API 에러 시 에러 메시지를 표시해야 한다', async () => {
    mockPatch.mockRejectedValue(new Error('콘텐츠를 찾을 수 없습니다.'));
    const user = userEvent.setup();
    render(<ContentManagement />);

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '99999');
    await user.click(screen.getByText('차단'));

    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(screen.getByText('콘텐츠를 찾을 수 없습니다.')).toBeInTheDocument();
    });
  });

  it('성공 후 TMDB ID 입력 필드가 초기화되어야 한다', async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ContentManagement />);

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '12345');
    await user.click(screen.getByText('차단'));
    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(tmdbIdInput).toHaveValue(null);
    });
  });
});
