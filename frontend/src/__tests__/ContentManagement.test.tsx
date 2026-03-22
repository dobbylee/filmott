import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContentManagement from '@/components/admin/ContentManagement';

const mockPatch = vi.fn();
const mockGet = vi.fn();

vi.mock('@/app/contents/[type]/[tmdbId]/actions', () => ({
  revalidateContentDetail: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: vi.fn(),
  },
}));

describe('ContentManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: 빈 차단 목록 반환
    mockGet.mockResolvedValue({ data: [] });
  });

  it('타입 셀렉트와 TMDB ID 입력 필드를 렌더링해야 한다', () => {
    render(<ContentManagement />);

    expect(screen.getByLabelText('타입')).toBeInTheDocument();
    expect(screen.getByLabelText('TMDB ID')).toBeInTheDocument();
    expect(screen.getByText('차단')).toBeInTheDocument();
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

    // 폼의 해제 버튼 (ShieldOff 아이콘 옆)
    const buttons = screen.getAllByText('해제');
    await user.click(buttons[0]);

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

    // 폼의 해제 버튼
    const buttons = screen.getAllByText('해제');
    await user.click(buttons[0]);

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

    // 폼의 해제 버튼
    const buttons = screen.getAllByText('해제');
    await user.click(buttons[0]);

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

  // 차단 목록 관련 테스트
  it('마운트 시 차단 목록을 조회해야 한다', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<ContentManagement />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/contents/adult-list');
    });
  });

  it('차단된 콘텐츠가 있으면 목록을 표시해야 한다', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, tmdbId: 123, contentType: 'movie', title: 'Adult Movie' },
        { id: 2, tmdbId: 456, contentType: 'tv', title: 'Adult TV Show' },
      ],
    });

    render(<ContentManagement />);

    await waitFor(() => {
      expect(screen.getByText('Adult Movie')).toBeInTheDocument();
      expect(screen.getByText('Adult TV Show')).toBeInTheDocument();
    });

    expect(screen.getByText('#123')).toBeInTheDocument();
    expect(screen.getByText('#456')).toBeInTheDocument();
  });

  it('차단된 콘텐츠가 없으면 안내 메시지를 표시해야 한다', async () => {
    mockGet.mockResolvedValue({ data: [] });

    render(<ContentManagement />);

    await waitFor(() => {
      expect(screen.getByText('차단된 콘텐츠가 없습니다')).toBeInTheDocument();
    });
  });

  it('차단 성공 후 목록을 새로고침해야 한다', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ContentManagement />);

    // 초기 로드
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    const tmdbIdInput = screen.getByLabelText('TMDB ID');
    await user.type(tmdbIdInput, '12345');
    await user.click(screen.getByText('차단'));
    await user.click(screen.getByText('확인'));

    // 차단 성공 후 목록 새로고침
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  it('목록에서 해제 버튼 클릭 시 확인 모달을 표시하고 API를 호출해야 한다', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, tmdbId: 123, contentType: 'movie', title: 'Adult Movie' },
      ],
    });
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<ContentManagement />);

    await waitFor(() => {
      expect(screen.getByText('Adult Movie')).toBeInTheDocument();
    });

    // 목록 내 해제 버튼 클릭
    const unblockButtons = screen.getAllByText('해제');
    await user.click(unblockButtons[unblockButtons.length - 1]);

    // 모달이 표시되어야 한다
    expect(screen.getByText(/Adult Movie.*차단을 해제하시겠습니까/)).toBeInTheDocument();

    // 모달에서 확인 클릭
    await user.click(screen.getByText('확인'));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/contents/adult', {
        tmdbId: 123,
        contentType: 'movie',
        adult: false,
      });
    });
  });
});
