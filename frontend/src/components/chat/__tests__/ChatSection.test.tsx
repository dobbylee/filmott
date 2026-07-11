import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatSection from '@/components/chat/ChatSection';
import type {
  ChatHistoryMessage,
  ChatRequestOptions,
  ChatStreamCallbacks,
} from '@/lib/chat-stream';

let mockAuthUser: { id: number; nickname: string } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
  }),
}));

// chat-stream mock
const mockSendChatMessage = vi.fn();
vi.mock('@/lib/chat-stream', () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}));

const mockTrackEvent = vi.fn();
vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
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
    window.history.replaceState({}, '', '/');
    mockAuthUser = null;
    mockSendChatMessage.mockReset();
    mockTrackEvent.mockReset();
    localStorageMock.clear();
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
    localStorageMock.removeItem.mockReset();
    localStorageMock.clear.mockClear();
    localStorageMock.getItem.mockImplementation((key: string) => localStorageMock._store[key] ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => {
      localStorageMock._store[key] = value;
    });
    localStorageMock.removeItem.mockImplementation((key: string) => {
      delete localStorageMock._store[key];
    });
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
        expect.objectContaining({
          isAuthenticated: false,
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(mockTrackEvent).toHaveBeenCalledWith('chat_message_sent', {
      turn_number: 1,
      entry_point: 'typed',
      authenticated: 0,
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
        expect.objectContaining({
          isAuthenticated: false,
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(mockTrackEvent).toHaveBeenCalledWith('chat_message_sent', {
      turn_number: 1,
      entry_point: 'example',
      authenticated: 0,
      example_id: 'solo_night_thriller',
    });
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'chat_example_clicked',
      expect.anything(),
    );
  });

  it('로그인 상태면 sendChatMessage에 isAuthenticated=true를 전달한다', async () => {
    mockAuthUser = { id: 1, nickname: 'tester' };
    mockSendChatMessage.mockImplementationOnce(() => new Promise(() => {}));

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '로그인 추천' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledWith(
        '로그인 추천',
        [],
        expect.any(Object),
        expect.objectContaining({
          isAuthenticated: true,
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  it('정상 완료 시 추천 수와 지연 시간을 chat_response_completed로 기록한다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onRecommendations([
          {
            tmdbId: 1,
            contentType: 'movie',
            title: '첫 작품',
            posterUrl: null,
          },
          {
            tmdbId: 2,
            contentType: 'tv',
            title: '두 번째 작품',
            posterUrl: null,
          },
        ]);
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatSection />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '추천 완료 테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'chat_response_completed',
        {
          turn_number: 1,
          entry_point: 'typed',
          authenticated: 0,
          recommendation_count: 2,
          latency_ms: expect.any(Number),
        },
      );
    });
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'chat_response_failed',
      expect.anything(),
    );
  });

  it('네트워크 예외는 chat_response_failed를 한 번만 기록해야 한다', async () => {
    mockSendChatMessage.mockRejectedValueOnce(new Error('network'));

    render(<ChatSection />);
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '네트워크 실패 테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await screen.findByText('메시지 전송 중 오류가 발생했습니다.');
    const failedEvents = mockTrackEvent.mock.calls.filter(
      ([eventName]) => eventName === 'chat_response_failed',
    );
    expect(failedEvents).toEqual([
      [
        'chat_response_failed',
        {
          turn_number: 1,
          entry_point: 'typed',
          authenticated: 0,
          failure_type: 'network',
        },
      ],
    ]);
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

  it('localStorage에서 메시지를 복원하여 표시한다', async () => {
    const savedMessages = [
      { id: 1, role: 'user', content: '복원된 질문', recommendations: null, createdAt: '2026-03-25T00:00:00Z' },
      { id: 2, role: 'assistant', content: '복원된 AI 응답 텍스트', recommendations: null, createdAt: '2026-03-25T00:00:01Z' },
    ];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedMessages));

    render(<ChatSection />);

    await waitFor(() => {
      expect(screen.getByText('복원된 AI 응답 텍스트')).toBeInTheDocument();
    });
  });

  it('50개 초과 메시지는 최근 50개만 유지한다', async () => {
    const manyMessages = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `메시지 ${i}`,
      recommendations: null,
      createdAt: new Date().toISOString(),
    }));
    localStorageMock.getItem.mockReturnValue(JSON.stringify(manyMessages));

    render(<ChatSection />);

    await waitFor(() => {
      const setItemCalls = localStorageMock.setItem.mock.calls.filter(
        (call: string[]) => call[0] === 'filmott_chat_messages',
      );
      expect(setItemCalls.length).toBeGreaterThan(0);
      const savedData = JSON.parse(setItemCalls[0][1]);
      expect(savedData).toHaveLength(50);
      expect(savedData[0].content).toBe('메시지 10');
      expect(savedData[49].content).toBe('메시지 59');
    });
  });

  it('"새 대화" 버튼 클릭 시 메시지와 localStorage를 초기화한다', async () => {
    const savedMessages = [
      { id: 1, role: 'user', content: '기존 메시지', recommendations: null, createdAt: '2026-03-25T00:00:00Z' },
      { id: 2, role: 'assistant', content: 'AI 응답', recommendations: null, createdAt: '2026-03-25T00:00:01Z' },
    ];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedMessages));

    render(<ChatSection />);

    await waitFor(() => {
      expect(screen.getByText('새 대화')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('새 대화'));

    await waitFor(() => {
      expect(screen.getByText('오늘 뭐 볼까?')).toBeInTheDocument();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('filmott_chat_messages');
  });

  it('"새 대화" 클릭 시 진행 중인 요청을 중단하고 늦은 콜백을 무시한다', async () => {
    const captured: {
      streamCallbacks?: ChatStreamCallbacks;
      requestOptions?: ChatRequestOptions;
    } = {};

    mockSendChatMessage.mockImplementationOnce(
      (
        _content: string,
        _history: ChatHistoryMessage[],
        callbacks: ChatStreamCallbacks,
        options: ChatRequestOptions,
      ) => {
        captured.streamCallbacks = callbacks;
        captured.requestOptions = options;
        return new Promise(() => {});
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '진행 중인 요청' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('새 대화')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('새 대화'));

    const abortSignal = captured.requestOptions?.signal;
    if (!abortSignal) {
      throw new Error('AbortSignal이 필요합니다.');
    }
    expect(abortSignal.aborted).toBe(true);

    act(() => {
      captured.streamCallbacks?.onText('늦은 응답');
      captured.streamCallbacks?.onDone();
    });

    expect(screen.queryByText('늦은 응답')).not.toBeInTheDocument();
    expect(screen.getByText('오늘 뭐 볼까?')).toBeInTheDocument();
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'chat_response_completed',
      expect.anything(),
    );
  });

  it('대화가 없을 때는 "새 대화" 버튼이 표시되지 않는다', () => {
    localStorageMock.getItem.mockReturnValue('');
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
    expect(mockTrackEvent).toHaveBeenCalledWith('chat_response_failed', {
      turn_number: 1,
      entry_point: 'typed',
      authenticated: 0,
      failure_type: 'server',
    });
  });

  it('텍스트 없는 오류를 메시지 스크롤 영역의 마지막 버블로 표시한다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onError('추천 응답을 만들지 못했습니다.');
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    fireEvent.click(screen.getByText('통쾌한 액션 영화 추천해줘'));

    const errorBubble = await screen.findByRole('alert');
    const messagesContainer = errorBubble.parentElement?.parentElement?.parentElement;

    expect(errorBubble).toHaveTextContent('추천 응답을 만들지 못했습니다.');
    expect(messagesContainer).toHaveClass('overflow-y-auto');
    expect(errorBubble.parentElement).toBe(messagesContainer?.lastElementChild?.lastElementChild);
  });

  it('일부 응답 뒤 onError가 오면 불완전 응답을 보존한다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onText('먼저 도착한 일부 응답');
        callbacks.onError('스트림 처리 중 오류가 발생했습니다.');
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '부분 응답 테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('먼저 도착한 일부 응답')).toBeInTheDocument();
      expect(
        screen.getByText('연결이 중단되어 일부 응답만 표시됩니다.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('스트림 처리 중 오류가 발생했습니다.'),
      ).toBeInTheDocument();
    });
  });

  it('세션 만료 에러가 나도 기존 대화 localStorage는 지우지 않는다', async () => {
    const savedMessages = [
      { id: 1, role: 'user', content: '기존 메시지', recommendations: null, createdAt: '2026-03-25T00:00:00Z' },
      { id: 2, role: 'assistant', content: '기존 응답', recommendations: null, createdAt: '2026-03-25T00:00:01Z' },
    ];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedMessages));
    mockAuthUser = { id: 1, nickname: 'tester' };
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onError('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '새 메시지' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')).toBeInTheDocument();
    });

    expect(localStorageMock.removeItem).not.toHaveBeenCalledWith('filmott_chat_messages');
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

  it('이전 어시스턴트 추천 메타데이터를 history에 포함한다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onText('추천 응답');
        callbacks.onRecommendations([
          {
            tmdbId: 496243,
            contentType: 'movie',
            title: '기생충',
            posterUrl: '/poster.jpg',
          },
        ]);
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
    });

    const history = mockSendChatMessage.mock.calls[1][1] as ChatHistoryMessage[];
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          recommendations: [
            {
              tmdbId: 496243,
              contentType: 'movie',
              title: '기생충',
            },
          ],
        }),
      ]),
    );
  });

  it('불완전한 어시스턴트 응답은 다음 요청 history에서 제외한다', async () => {
    mockSendChatMessage.mockImplementationOnce(
      (_content: string, _history: ChatHistoryMessage[], callbacks: ChatStreamCallbacks) => {
        callbacks.onText('잘린 응답');
        callbacks.onError('연결이 끊겼습니다.');
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '첫 질문' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('잘린 응답')).toBeInTheDocument();
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
    });

    const history = mockSendChatMessage.mock.calls[1][1] as ChatHistoryMessage[];
    expect(history).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'assistant', content: '잘린 응답' }),
      ]),
    );
  });

  it('id="chat-section" 속성이 부여된다', () => {
    const { container } = render(<ChatSection />);
    expect(container.querySelector('#chat-section')).toBeInTheDocument();
  });

  it('상세 CTA 질문을 자동 전송하지 않고 입력 필드에만 채운 뒤 query를 제거한다', async () => {
    window.history.replaceState(
      {},
      '',
      '/?from=detail&chatPrompt=%EA%B8%B0%EC%83%9D%EC%B6%A9%20%EA%B0%99%EC%9D%80%20%EB%8A%90%EB%82%8C%EC%9D%98%20%EC%9E%91%ED%92%88%20%EC%B6%94%EC%B2%9C%ED%95%B4%EC%A4%98#chat-section',
    );

    render(<ChatSection />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('메시지를 입력하세요.')).toHaveValue(
        '기생충 같은 느낌의 작품 추천해줘',
      );
    });
    expect(mockSendChatMessage).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?from=detail');
    expect(window.location.hash).toBe('#chat-section');
  });

  it('React Strict Mode에서도 상세 CTA 질문을 유지해야 한다', async () => {
    window.history.replaceState(
      {},
      '',
      '/?chatPrompt=%EC%97%84%EA%B2%A9%20%EB%AA%A8%EB%93%9C%20%EC%B6%94%EC%B2%9C#chat-section',
    );

    render(
      <StrictMode>
        <ChatSection />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('메시지를 입력하세요.')).toHaveValue(
        '엄격 모드 추천',
      );
    });
    expect(window.location.search).toBe('');
  });

  it('상세 CTA에서 채운 질문을 보내면 content_detail 진입점으로 기록한다', async () => {
    window.history.replaceState(
      {},
      '',
      '/?chatPrompt=%EA%B8%B0%EC%83%9D%EC%B6%A9%20%EA%B0%99%EC%9D%80%20%EB%8A%90%EB%82%8C%EC%9D%98%20%EC%9E%91%ED%92%88%20%EC%B6%94%EC%B2%9C%ED%95%B4%EC%A4%98#chat-section',
    );
    mockSendChatMessage.mockImplementationOnce(
      (
        _content: string,
        _history: ChatHistoryMessage[],
        callbacks: ChatStreamCallbacks,
      ) => {
        callbacks.onDone();
        return Promise.resolve();
      },
    );

    render(<ChatSection />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    await waitFor(() => {
      expect(textarea).toHaveValue('기생충 같은 느낌의 작품 추천해줘');
    });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith('chat_message_sent', {
        turn_number: 1,
        entry_point: 'content_detail',
        authenticated: 0,
      });
    });
  });

  it('상세 CTA 질문을 채워도 저장된 기존 대화를 유지한다', async () => {
    const savedMessages = [
      {
        id: 1,
        role: 'user',
        content: '기존 질문',
        recommendations: null,
        createdAt: '2026-07-11T00:00:00.000Z',
      },
    ];
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedMessages));
    window.history.replaceState(
      {},
      '',
      '/?chatPrompt=%EC%83%88%EB%A1%9C%EC%9A%B4%20%EC%B6%94%EC%B2%9C%20%EC%A7%88%EB%AC%B8#chat-section',
    );

    render(<ChatSection />);

    await waitFor(() => {
      expect(screen.getByText('기존 질문')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('메시지를 입력하세요.')).toHaveValue(
        '새로운 추천 질문',
      );
    });
  });
});
