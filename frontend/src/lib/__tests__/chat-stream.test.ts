import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendChatMessage } from '@/lib/chat-stream';
import type { ChatStreamCallbacks } from '@/lib/chat-stream';
import { AUTH_REQUIRED_EVENT } from '@/lib/constants';

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
    const sseData =
      'event: text\ndata: {"content":"안녕"}\n\nevent: text\ndata: {"content":"하세요"}\n\nevent: done\ndata: {}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(createMockResponse([sseData]));

    await sendChatMessage('안녕', [], callbacks);

    expect(callbacks.onText).toHaveBeenCalledWith('안녕');
    expect(callbacks.onText).toHaveBeenCalledWith('하세요');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('recommendations 이벤트를 올바르게 파싱한다', async () => {
    const recs = [{ tmdbId: 123, contentType: 'movie', title: '기생충', reason: '좋은 영화' }];
    const sseData = `event: recommendations\ndata: ${JSON.stringify({ recommendations: recs })}\n\nevent: done\ndata: {}\n\n`;

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(createMockResponse([sseData]));

    await sendChatMessage('추천해줘', [], callbacks);

    expect(callbacks.onRecommendations).toHaveBeenCalledWith(recs);
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('error 이벤트를 올바르게 파싱한다', async () => {
    const sseData = 'event: error\ndata: {"message":"오류 발생"}\n\n';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(createMockResponse([sseData]));

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('오류 발생');
  });

  it('guest 요청이 401 후 refresh 실패면 서버 세션을 정리한 뒤 다시 guest 요청을 시도한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(createMockResponse([], 401))
      .mockResolvedValueOnce(createMockResponse([], 401))
      .mockResolvedValueOnce(createMockResponse([], 204))
      .mockResolvedValueOnce(createMockResponse(['event: done\ndata: {}\n\n']));

    await sendChatMessage('테스트', [], callbacks);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('로그인 사용자의 401 응답이 refresh 실패로 이어지면 세션 만료 에러를 호출한다', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(createMockResponse([], 401))
      .mockResolvedValueOnce(createMockResponse([], 401));

    await sendChatMessage('테스트', [], callbacks, { isAuthenticated: true });

    expect(callbacks.onError).toHaveBeenCalledWith('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const authEvent = dispatchSpy.mock.calls.find(
      (call) => (call[0] as CustomEvent).type === AUTH_REQUIRED_EVENT,
    );
    expect(authEvent).toBeDefined();
  });

  it('401 응답 후 refresh가 성공하면 원 요청을 재시도해야 한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(createMockResponse([], 401))
      .mockResolvedValueOnce(createMockResponse([], 200))
      .mockResolvedValueOnce(createMockResponse(['event: done\ndata: {}\n\n']));

    await sendChatMessage('테스트', [], callbacks);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });

  it('429 응답 시 onError를 호출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(createMockResponse([], 429));

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  });

  it('credentials include와 JSON body로 fetch를 호출한다', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(createMockResponse(['event: done\ndata: {}\n\n']));

    const history = [{ role: 'user' as const, content: '이전 메시지' }];
    await sendChatMessage('테스트 메시지', history, callbacks);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/chat/messages'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: '테스트 메시지', history }),
        credentials: 'include',
      }),
    );
  });

  it('500 응답 시 onError를 호출한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(createMockResponse([], 500));

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

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(createMockResponse([chunk1, chunk2]));

    await sendChatMessage('테스트', [], callbacks);

    expect(callbacks.onText).toHaveBeenCalledTimes(2);
    expect(callbacks.onText).toHaveBeenCalledWith('첫 번째');
    expect(callbacks.onText).toHaveBeenCalledWith(' 두 번째');
    expect(callbacks.onDone).toHaveBeenCalledTimes(1);
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
});
