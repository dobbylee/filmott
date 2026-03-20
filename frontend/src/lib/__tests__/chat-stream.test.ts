import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendChatMessage } from '@/lib/chat-stream';
import type { ChatStreamCallbacks } from '@/lib/chat-stream';

// localStorage mock
const mockLocalStorage: Record<string, string> = {
  access_token: 'test-token',
};

Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
});

function createMockResponse(chunks: string[], status = 200): Response {
  let chunkIndex = 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    headers: new Headers(),
  } as Response;
}

describe('sendChatMessage', () => {
  let callbacks: ChatStreamCallbacks;

  beforeEach(() => {
    callbacks = {
      onText: vi.fn(),
      onRecommendations: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };
    vi.restoreAllMocks();
  });

  it('text 이벤트를 올바르게 파싱한다', async () => {
    const sseData = 'event: text\ndata: {"content":"안녕"}\n\nevent: text\ndata: {"content":"하세요"}\n\nevent: done\ndata: {}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([sseData]),
    );

    await sendChatMessage('안녕', [], callbacks);

    expect(callbacks.onText).toHaveBeenCalledWith('안녕');
    expect(callbacks.onText).toHaveBeenCalledWith('하세요');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('recommendations 이벤트를 올바르게 파싱한다', async () => {
    const recs = [{ tmdbId: 123, contentType: 'movie', title: '기생충', reason: '좋은 영화' }];
    const sseData = `event: recommendations\ndata: ${JSON.stringify({ recommendations: recs })}\n\nevent: done\ndata: {}\n\n`;

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([sseData]),
    );

    await sendChatMessage('추천해줘', [], callbacks);

    expect(callbacks.onRecommendations).toHaveBeenCalledWith(recs);
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('error 이벤트를 올바르게 파싱한다', async () => {
    const sseData = 'event: error\ndata: {"message":"오류 발생"}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([sseData]),
    );

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('오류 발생');
  });

  it('401 응답 시 onError를 호출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([], 401),
    );

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('로그인이 필요합니다. 다시 로그인해주세요.');
  });

  it('429 응답 시 onError를 호출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([], 429),
    );

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  });

  it('올바른 헤더와 URL로 fetch를 호출한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse(['event: done\ndata: {}\n\n']),
    );

    const history = [{ role: 'user' as const, content: '이전 메시지' }];
    await sendChatMessage('테스트 메시지', history, callbacks);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/chat/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        }),
        body: JSON.stringify({ content: '테스트 메시지', history }),
      }),
    );
  });

  it('500 응답 시 onError를 호출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([], 500),
    );

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('메시지 전송에 실패했습니다.');
  });

  it('네트워크 오류(fetch reject) 시 예외가 전파된다', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network Error'));

    await expect(sendChatMessage('테스트', [], callbacks)).rejects.toThrow('Network Error');
  });

  it('여러 청크로 분할된 SSE를 올바르게 파싱한다', async () => {
    const chunk1 = 'event: text\ndata: {"content":"첫 번째"}\n\n';
    const chunk2 = 'event: text\ndata: {"content":" 두 번째"}\n\nevent: done\ndata: {}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([chunk1, chunk2]),
    );

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onText).toHaveBeenCalledTimes(2);
    expect(callbacks.onText).toHaveBeenCalledWith('첫 번째');
    expect(callbacks.onText).toHaveBeenCalledWith(' 두 번째');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('대화 이력을 포함하여 올바르게 전송한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse(['event: done\ndata: {}\n\n']),
    );

    const history = [
      { role: 'user' as const, content: '이전 질문' },
      { role: 'assistant' as const, content: '이전 답변' },
    ];

    await sendChatMessage('새 질문', history, callbacks);

    const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.history).toEqual(history);
    expect(callBody.content).toBe('새 질문');
  });

  it('response.body가 null이면 onError를 호출한다', async () => {
    const nullBodyResponse = {
      ok: true,
      status: 200,
      body: null,
      headers: new Headers(),
    } as Response;

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(nullBodyResponse);

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('서버 응답을 읽을 수 없습니다.');
  });

  it('스트림 종료 후 버퍼에 남은 데이터를 처리한다', async () => {
    // 마지막 청크가 개행 없이 끝나는 경우 (버퍼에 잔여 데이터)
    const chunk = 'event: text\ndata: {"content":"버퍼"}\nevent: done\ndata: {}';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([chunk]),
    );

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onText).toHaveBeenCalledWith('버퍼');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });
});
