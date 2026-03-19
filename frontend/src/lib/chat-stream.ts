import type { ChatRecommendationWithPoster } from '@/types/chat';

export interface ChatStreamCallbacks {
  onText: (content: string) => void;
  onRecommendations: (recs: ChatRecommendationWithPoster[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  try {
    const res = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

async function fetchWithAuth(
  url: string,
  body: string,
): Promise<Response> {
  let token = localStorage.getItem('access_token');

  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body,
  });

  // 401이면 토큰 갱신 후 재시도
  if (response.status === 401) {
    token = await refreshAccessToken();
    if (!token) return response;

    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body,
    });
  }

  return response;
}

export async function sendChatMessage(
  content: string,
  history: ChatHistoryMessage[],
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  const response = await fetchWithAuth(
    `${apiUrl}/chat/messages`,
    JSON.stringify({ content, history }),
  );

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
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

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
              callbacks.onDone();
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

  // 스트림 종료 후 버퍼에 남은 데이터 처리
  if (buffer.trim()) {
    const remainingLines = buffer.split('\n');
    for (const line of remainingLines) {
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
              callbacks.onDone();
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
