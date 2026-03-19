import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatPage from '@/components/chat/ChatPage';

// AuthContext mock
let mockUser: { id: number; nickname: string } | null = { id: 1, nickname: 'tester' };
const mockOpenAuthModal = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    openAuthModal: mockOpenAuthModal,
  }),
}));

// api mock
const mockPost = vi.fn();
const mockGet = vi.fn().mockResolvedValue({ data: [] });
vi.mock('@/lib/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

// chat-stream mock
const mockSendChatMessage = vi.fn();
vi.mock('@/lib/chat-stream', () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}));

// next/navigation mock
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
}));

describe('ChatPage', () => {
  beforeEach(() => {
    mockUser = { id: 1, nickname: 'tester' };
    mockPost.mockReset();
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: [] });
    mockSendChatMessage.mockReset();
    mockOpenAuthModal.mockReset();
  });

  it('환영 메시지를 렌더링한다', () => {
    render(<ChatPage />);
    expect(screen.getByText('오늘 뭐 볼까?')).toBeInTheDocument();
  });

  it('예시 질문 버튼들을 렌더링한다', () => {
    render(<ChatPage />);
    expect(screen.getByText('비 오는 날에 볼 만한 잔잔한 영화')).toBeInTheDocument();
    expect(screen.getByText('친구들이랑 볼 코미디 추천해줘')).toBeInTheDocument();
    expect(screen.getByText('요즘 핫한 넷플릭스 시리즈 뭐가 있어?')).toBeInTheDocument();
    expect(screen.getByText('밤에 혼자 볼 스릴러 추천')).toBeInTheDocument();
  });

  it('입력 영역을 렌더링한다', () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText('메시지를 입력하세요...')).toBeInTheDocument();
  });

  it('메시지 전송 시 세션을 생성하고 메시지를 보낸다', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 10 } });
    mockSendChatMessage.mockImplementationOnce(
      (_sessionId: number, _content: string, callbacks: { onDone: (id: number) => void }) => {
        callbacks.onDone(100);
        return Promise.resolve();
      },
    );

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '영화 추천해줘' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/chat/sessions');
    });

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledWith(
        10,
        '영화 추천해줘',
        expect.objectContaining({
          onText: expect.any(Function),
          onRecommendations: expect.any(Function),
          onDone: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
  });

  it('비로그인 상태에서 메시지 전송 시 로그인 모달을 연다', () => {
    mockUser = null;

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(mockOpenAuthModal).toHaveBeenCalled();
  });

  it('사용자 메시지가 낙관적으로 화면에 표시된다', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 10 } });
    mockSendChatMessage.mockImplementationOnce(() => new Promise(() => {})); // pending

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '테스트 메시지' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('테스트 메시지')).toBeInTheDocument();
    });
  });

  it('예시 질문 클릭 시 해당 메시지가 전송된다', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 10 } });
    mockSendChatMessage.mockImplementationOnce(() => new Promise(() => {}));

    render(<ChatPage />);

    fireEvent.click(screen.getByText('밤에 혼자 볼 스릴러 추천'));

    await waitFor(() => {
      expect(screen.getByText('밤에 혼자 볼 스릴러 추천')).toBeInTheDocument();
    });
  });

  it('안내 문구가 표시된다', () => {
    render(<ChatPage />);
    expect(screen.getByText('AI가 추천한 정보는 정확하지 않을 수 있습니다.')).toBeInTheDocument();
  });

  it('onError 콜백 시 에러 메시지가 화면에 표시된다', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 10 } });
    mockSendChatMessage.mockImplementationOnce(
      (_sessionId: number, _content: string, callbacks: { onError: (msg: string) => void }) => {
        callbacks.onError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        return Promise.resolve();
      },
    );

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '에러 테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')).toBeInTheDocument();
    });
  });

  it('스트리밍 완료(onDone) 후 입력이 다시 활성화된다', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 10 } });

    // sendChatMessage가 pending 상태를 유지하다가 resolve될 때까지 지연
    let resolveStream: () => void;
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    mockSendChatMessage.mockImplementationOnce(
      (_sessionId: number, _content: string, callbacks: { onDone: (id: number) => void }) => {
        return streamPromise.then(() => {
          callbacks.onDone(999);
        });
      },
    );

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '추천해줘' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // 스트리밍 중에는 입력 비활성화
    await waitFor(() => {
      expect(textarea).toBeDisabled();
    });

    // 스트리밍 완료
    resolveStream!();

    // onDone 후에는 입력 활성화
    await waitFor(() => {
      expect(textarea).not.toBeDisabled();
    });
  });
});
