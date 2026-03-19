import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatPage from '@/components/chat/ChatPage';
import type { ChatHistoryMessage, ChatStreamCallbacks } from '@/lib/chat-stream';

// AuthContext mock
let mockUser: { id: number; nickname: string } | null = { id: 1, nickname: 'tester' };
const mockOpenAuthModal = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    openAuthModal: mockOpenAuthModal,
  }),
}));

// chat-stream mock
const mockSendChatMessage = vi.fn();
vi.mock('@/lib/chat-stream', () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}));

// sessionStorage mock
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; },
  };
})();

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

describe('ChatPage', () => {
  beforeEach(() => {
    mockUser = { id: 1, nickname: 'tester' };
    mockSendChatMessage.mockReset();
    mockOpenAuthModal.mockReset();
    sessionStorageMock.clear();
    sessionStorageMock.getItem.mockClear();
    sessionStorageMock.setItem.mockClear();
    sessionStorageMock.removeItem.mockClear();
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

  it('첫 진입 시 "대화는 탭을 닫으면 사라져요" 안내를 표시한다', () => {
    render(<ChatPage />);
    expect(screen.getByText('대화는 탭을 닫으면 사라져요')).toBeInTheDocument();
  });

  it('입력 영역을 렌더링한다', () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText('메시지를 입력하세요...')).toBeInTheDocument();
  });

  it('AI 안내 문구가 표시된다', () => {
    render(<ChatPage />);
    expect(screen.getByText('AI가 추천한 정보는 정확하지 않을 수 있습니다.')).toBeInTheDocument();
  });

  it('메시지 전송 시 history를 포함하여 sendChatMessage를 호출한다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '영화 추천해줘' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledWith(
        '영화 추천해줘',
        [],
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
    mockSendChatMessage.mockImplementationOnce(() => new Promise(() => {}));

    render(<ChatPage />);

    fireEvent.click(screen.getByText('밤에 혼자 볼 스릴러 추천'));

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledWith(
        '밤에 혼자 볼 스릴러 추천',
        expect.any(Array),
        expect.any(Object),
      );
    });
  });

  it('메시지 전송 후 sessionStorage에 저장된다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '저장 테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'filmott_chat_messages',
        expect.any(String),
      );
    });
  });

  it('sessionStorage에서 메시지를 복원한다', () => {
    const savedMessages = [
      {
        id: 1,
        role: 'user',
        content: '복원된 메시지',
        recommendations: null,
        createdAt: '2026-03-19T00:00:00Z',
      },
    ];
    sessionStorageMock.getItem.mockReturnValueOnce(JSON.stringify(savedMessages));

    render(<ChatPage />);

    expect(screen.getByText('복원된 메시지')).toBeInTheDocument();
  });

  it('"새 대화" 버튼 클릭 시 메시지와 sessionStorage를 초기화한다', async () => {
    const savedMessages = [
      {
        id: 1,
        role: 'user',
        content: '기존 메시지',
        recommendations: null,
        createdAt: '2026-03-19T00:00:00Z',
      },
      {
        id: 2,
        role: 'assistant',
        content: 'AI 응답',
        recommendations: null,
        createdAt: '2026-03-19T00:00:01Z',
      },
    ];
    sessionStorageMock.getItem.mockReturnValueOnce(JSON.stringify(savedMessages));

    render(<ChatPage />);

    // 대화가 있을 때 "새 대화" 버튼이 표시됨
    const newChatButton = screen.getByText('새 대화');
    expect(newChatButton).toBeInTheDocument();

    fireEvent.click(newChatButton);

    // 환영 메시지가 다시 표시됨
    await waitFor(() => {
      expect(screen.getByText('오늘 뭐 볼까?')).toBeInTheDocument();
    });

    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('filmott_chat_messages');
  });

  it('대화가 없을 때는 "새 대화" 버튼이 표시되지 않는다', () => {
    render(<ChatPage />);
    expect(screen.queryByText('새 대화')).not.toBeInTheDocument();
  });

  it('onError 콜백 시 에러 메시지가 화면에 표시된다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
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
    // sendChatMessage가 pending 상태를 유지하다가 resolve될 때까지 지연
    let resolveStream: () => void;
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        return streamPromise.then(() => {
          callbacks.onDone();
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

  it('두 번째 메시지 전송 시 이전 대화를 history로 전달한다', async () => {
    // 첫 번째 메시지 전송
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onText('첫 번째 응답');
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatPage />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요...');
    fireEvent.change(textarea, { target: { value: '첫 번째 질문' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
    });

    // 두 번째 메시지 전송
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    fireEvent.change(textarea, { target: { value: '두 번째 질문' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledTimes(2);
      const secondCallArgs = mockSendChatMessage.mock.calls[1];
      // 두 번째 호출의 history에 이전 대화가 포함됨
      expect(secondCallArgs[0]).toBe('두 번째 질문');
      expect(secondCallArgs[1]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: '첫 번째 질문' }),
        ]),
      );
    });
  });
});
