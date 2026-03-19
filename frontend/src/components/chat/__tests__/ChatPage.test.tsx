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
vi.mock('@/lib/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// chat-stream mock
const mockSendChatMessage = vi.fn();
vi.mock('@/lib/chat-stream', () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}));

describe('ChatPage', () => {
  beforeEach(() => {
    mockUser = { id: 1, nickname: 'tester' };
    mockPost.mockReset();
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
});
