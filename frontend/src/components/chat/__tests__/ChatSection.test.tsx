import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatSection from '@/components/chat/ChatSection';
import type { ChatHistoryMessage, ChatStreamCallbacks } from '@/lib/chat-stream';

// chat-stream mock
const mockSendChatMessage = vi.fn();
vi.mock('@/lib/chat-stream', () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}));

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('ChatSection', () => {
  beforeEach(() => {
    mockSendChatMessage.mockReset();
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  it('환영 메시지를 렌더링한다', () => {
    render(<ChatSection />);
    expect(screen.getByText('오늘 뭐 볼까?')).toBeInTheDocument();
  });

  it('예시 질문 버튼들을 렌더링한다', () => {
    render(<ChatSection />);
    expect(screen.getByText('최신 넷플릭스 시리즈 추천해줘')).toBeInTheDocument();
    expect(screen.getByText('친구들이랑 볼 코미디 영화 추천해줘')).toBeInTheDocument();
    expect(screen.getByText('통쾌한 액션 영화 추천해줘')).toBeInTheDocument();
    expect(screen.getByText('밤에 혼자 볼 스릴러 영화 추천해줘')).toBeInTheDocument();
  });

  it('입력 영역을 렌더링한다', () => {
    render(<ChatSection />);
    expect(screen.getByPlaceholderText('메시지를 입력하세요.')).toBeInTheDocument();
  });

  it('비로그인 상태에서도 메시지가 바로 전송된다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
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

  it('사용자 메시지가 낙관적으로 화면에 표시된다', async () => {
    mockSendChatMessage.mockImplementationOnce(() => new Promise(() => {}));

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '테스트 메시지' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('테스트 메시지')).toBeInTheDocument();
    });
  });

  it('예시 질문 클릭 시 해당 메시지가 전송된다', async () => {
    mockSendChatMessage.mockImplementationOnce(() => new Promise(() => {}));

    render(<ChatSection />);

    fireEvent.click(screen.getByText('밤에 혼자 볼 스릴러 영화 추천해줘'));

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledWith(
        '밤에 혼자 볼 스릴러 영화 추천해줘',
        expect.any(Array),
        expect.any(Object),
      );
    });
  });

  it('메시지 전송 후 localStorage에 저장된다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '저장 테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'filmott_chat_messages',
        expect.any(String),
      );
    });
  });

  it('localStorage에서 메시지를 복원하여 표시한다', () => {
    const savedMessages = [
      { id: 1, role: 'user', content: '복원된 질문', recommendations: null, createdAt: '2026-03-25T00:00:00Z' },
      { id: 2, role: 'assistant', content: '복원된 AI 응답 텍스트', recommendations: null, createdAt: '2026-03-25T00:00:01Z' },
    ];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedMessages));

    render(<ChatSection />);

    expect(screen.getByText('복원된 AI 응답 텍스트')).toBeInTheDocument();
  });

  it('50개 초과 메시지는 최근 50개만 유지한다', () => {
    const manyMessages = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `메시지 ${i}`,
      recommendations: null,
      createdAt: new Date().toISOString(),
    }));
    localStorageMock.getItem.mockReturnValue(JSON.stringify(manyMessages));

    render(<ChatSection />);

    const setItemCalls = localStorageMock.setItem.mock.calls.filter(
      (call: string[]) => call[0] === 'filmott_chat_messages',
    );
    expect(setItemCalls.length).toBeGreaterThan(0);
    const savedData = JSON.parse(setItemCalls[0][1]);
    expect(savedData).toHaveLength(50);
    expect(savedData[0].content).toBe('메시지 10');
    expect(savedData[49].content).toBe('메시지 59');
  });

  it('"새 대화" 버튼 클릭 시 메시지와 localStorage를 초기화한다', async () => {
    const savedMessages = [
      { id: 1, role: 'user', content: '기존 메시지', recommendations: null, createdAt: '2026-03-25T00:00:00Z' },
      { id: 2, role: 'assistant', content: 'AI 응답', recommendations: null, createdAt: '2026-03-25T00:00:01Z' },
    ];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedMessages));

    render(<ChatSection />);

    fireEvent.click(screen.getByText('새 대화'));

    await waitFor(() => {
      expect(screen.getByText('오늘 뭐 볼까?')).toBeInTheDocument();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('filmott_chat_messages');
  });

  it('대화가 없을 때는 "새 대화" 버튼이 표시되지 않는다', () => {
    localStorageMock.getItem.mockReturnValue(null);
    render(<ChatSection />);
    expect(screen.queryByText('새 대화')).not.toBeInTheDocument();
  });

  it('onError 콜백 시 에러 메시지가 화면에 표시된다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '에러 테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')).toBeInTheDocument();
    });
  });

  it('스트리밍 완료(onDone) 후 입력이 다시 활성화된다', async () => {
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

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '추천해줘' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(textarea).toBeDisabled();
    });

    resolveStream!();

    await waitFor(() => {
      expect(textarea).not.toBeDisabled();
    });
  });

  it('두 번째 메시지 전송 시 이전 대화를 history로 전달한다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onText('첫 번째 응답');
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '첫 번째 질문' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
    });

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
      expect(secondCallArgs[0]).toBe('두 번째 질문');
      expect(secondCallArgs[1]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: '첫 번째 질문' }),
        ]),
      );
    });
  });

  it('id="chat-section" 속성이 부여된다', () => {
    const { container } = render(<ChatSection />);
    expect(container.querySelector('#chat-section')).toBeInTheDocument();
  });
});
