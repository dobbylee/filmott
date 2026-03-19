import type { ChatRecommendationWithPoster } from '@/types/chat';

export interface ChatStreamCallbacks {
  onText: (content: string) => void;
  onRecommendations: (recs: ChatRecommendationWithPoster[]) => void;
  onDone: (messageId: number) => void;
  onError: (message: string) => void;
}

export async function sendChatMessage(
  sessionId: number,
  content: string,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const token = localStorage.getItem('access_token');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  const response = await fetch(`${apiUrl}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      callbacks.onError('로그인이 필요합니다. 다시 로그인해주세요.');
      return;
    }
    if (response.status === 429) {
      callbacks.onError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    callbacks.onError('메시지 전송에 실패했습니다.');
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          switch (currentEvent) {
            case 'text':
              callbacks.onText(data.content);
              break;
            case 'recommendations':
              callbacks.onRecommendations(data.recommendations);
              break;
            case 'done':
              callbacks.onDone(data.messageId);
              break;
            case 'error':
              callbacks.onError(data.message);
              break;
          }
        } catch {
          // JSON 파싱 실패 무시
        }
      }
    }
  }
}
