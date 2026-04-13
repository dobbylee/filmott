import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NicknameSetupModal from '@/components/auth/NicknameSetupModal';

const mockTrackEvent = vi.fn();
vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const mockHandleAuthSuccess = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    handleAuthSuccess: mockHandleAuthSuccess,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt as string} {...props} />
  ),
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

describe('NicknameSetupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('닉네임 입력 단계를 렌더링해야 한다', () => {
    render(<NicknameSetupModal />);

    expect(screen.getByText('닉네임 설정')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('2자 이상 닉네임')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
  });

  it('닉네임 유효성 통과 후 다음 버튼 클릭 시 OTT 선택 단계로 전환해야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText('OTT 구독 선택')).toBeInTheDocument();
    expect(screen.getByText('넷플릭스')).toBeInTheDocument();
    expect(screen.getByText('디즈니+')).toBeInTheDocument();
    expect(screen.getByText('왓챠')).toBeInTheDocument();
    expect(screen.getByText('웨이브')).toBeInTheDocument();
    expect(screen.getByText('티빙')).toBeInTheDocument();
    expect(screen.getByText('쿠팡플레이')).toBeInTheDocument();
  });

  it('OTT 선택 단계에서 뒤로 가기 시 닉네임 단계로 돌아가야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('OTT 구독 선택')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '이전 단계' }));
    expect(screen.getByText('닉네임 설정')).toBeInTheDocument();
  });

  it('OTT 선택 후 시작하기 클릭 시 subscribedOtts가 포함되어 API를 호출해야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });
    mockApiPost.mockResolvedValue({
      data: {
        user: { id: 1, nickname: 'testuser', subscribedOtts: ['netflix', 'tving'] },
      },
    });

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));

    // OTT 선택
    await user.click(screen.getByText('넷플릭스'));
    await user.click(screen.getByText('티빙'));

    await user.click(screen.getByRole('button', { name: '시작하기' }));

    expect(mockApiPost).toHaveBeenCalledWith('/auth/social/complete-signup', {
      nickname: 'testuser',
      subscribedOtts: ['netflix', 'tving'],
    });
  });

  it('건너뛰기 클릭 시 빈 배열로 API를 호출해야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });
    mockApiPost.mockResolvedValue({
      data: {
        user: { id: 1, nickname: 'testuser', subscribedOtts: [] },
      },
    });

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '건너뛰기' }));

    expect(mockApiPost).toHaveBeenCalledWith('/auth/social/complete-signup', {
      nickname: 'testuser',
      subscribedOtts: [],
    });
  });

  it('회원가입 완료 시 signup_completed 이벤트를 provider와 함께 호출해야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });
    mockApiPost.mockResolvedValue({
      data: {
        user: { id: 1, nickname: 'testuser', provider: 'google' },
      },
    });

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '시작하기' }));

    expect(mockTrackEvent).toHaveBeenCalledWith('signup_completed', { provider: 'google' });
  });

  it('provider가 없을 때 signup_completed 이벤트를 provider="unknown"으로 호출해야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });
    mockApiPost.mockResolvedValue({
      data: {
        user: { id: 1, nickname: 'testuser' },
      },
    });

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '건너뛰기' }));

    expect(mockTrackEvent).toHaveBeenCalledWith('signup_completed', { provider: 'unknown' });
  });

  it('API 실패 시 signup_completed 이벤트를 호출하지 않아야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });
    mockApiPost.mockRejectedValue(new Error('서버 오류'));

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '시작하기' }));

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('나중에 프로필에서 변경할 수 있어요 안내 문구가 표시되어야 한다', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({ data: { available: true } });

    render(<NicknameSetupModal />);

    const input = screen.getByPlaceholderText('2자 이상 닉네임');
    await user.type(input, 'testuser');

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 닉네임입니다.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('나중에 프로필에서 변경할 수 있어요')).toBeInTheDocument();
  });
});
