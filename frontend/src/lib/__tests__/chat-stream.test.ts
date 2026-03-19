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
    const sseData = 'event: text\ndata: {"content":"안녕"}\n\nevent: text\ndata: {"content":"하세요"}\n\nevent: done\ndata: {"messageId":1}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([sseData]),
    );

    await sendChatMessage(1, '안녕', callbacks);

    expect(callbacks.onText).toHaveBeenCalledWith('안녕');
    expect(callbacks.onText).toHaveBeenCalledWith('하세요');
    expect(callbacks.onDone).toHaveBeenCalledWith(1);
  });

  it('recommendations 이벤트를 올바르게 파싱한다', async () => {
    const recs = [{ tmdbId: 123, contentType: 'movie', title: '기생충', reason: '좋은 영화' }];
    const sseData = `event: recommendations\ndata: ${JSON.stringify({ recommendations: recs })}\n\nevent: done\ndata: {"messageId":2}\n\n`;

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([sseData]),
    );

    await sendChatMessage(1, '추천해줘', callbacks);

    expect(callbacks.onRecommendations).toHaveBeenCalledWith(recs);
    expect(callbacks.onDone).toHaveBeenCalledWith(2);
  });

  it('error 이벤트를 올바르게 파싱한다', async () => {
    const sseData = 'event: error\ndata: {"message":"오류 발생"}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([sseData]),
    );

    await sendChatMessage(1, '테스트', callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('오류 발생');
  });

  it('401 응답 시 onError를 호출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([], 401),
    );

    await sendChatMessage(1, '테스트', callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('로그인이 필요합니다. 다시 로그인해주세요.');
  });

  it('429 응답 시 onError를 호출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([], 429),
    );

    await sendChatMessage(1, '테스트', callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  });

  it('올바른 헤더와 URL로 fetch를 호출한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse(['event: done\ndata: {"messageId":1}\n\n']),
    );

    await sendChatMessage(5, '테스트 메시지', callbacks);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/chat/sessions/5/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        }),
        body: JSON.stringify({ content: '테스트 메시지' }),
      }),
    );
  });

  it('여러 청크로 분할된 SSE를 올바르게 파싱한다', async () => {
    const chunk1 = 'event: text\ndata: {"content":"첫 번째"}\n\n';
    const chunk2 = 'event: text\ndata: {"content":" 두 번째"}\n\nevent: done\ndata: {"messageId":3}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse([chunk1, chunk2]),
    );

    await sendChatMessage(1, '테스트', callbacks);

    expect(callbacks.onText).toHaveBeenCalledTimes(2);
    expect(callbacks.onText).toHaveBeenCalledWith('첫 번째');
    expect(callbacks.onText).toHaveBeenCalledWith(' 두 번째');
    expect(callbacks.onDone).toHaveBeenCalledWith(3);
  });
});
