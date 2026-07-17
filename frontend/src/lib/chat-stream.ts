import {
  clearServerSession,
  notifyAuthRequired,
  refreshSession,
} from '@/lib/auth-session';
import { isChatRecommendationArray, isRecord } from '@/lib/chat-guards';
import type { ChatRecommendationWithPoster } from '@/types/chat';

export interface ChatStreamCallbacks {
  onText: (content: string) => void;
  onReset: () => void;
  onRecommendations: (recs: ChatRecommendationWithPoster[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  recommendations?: Pick<
    ChatRecommendationWithPoster,
    'tmdbId' | 'contentType' | 'title'
  >[];
}

export interface ChatRequestOptions {
  isAuthenticated?: boolean;
  signal?: AbortSignal;
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    await refreshSession();
    return true;
  } catch {
    return false;
  }
}

async function clearExpiredServerSession(): Promise<void> {
  try {
    await clearServerSession();
  } catch {
    // 쿠키 정리 실패는 무시하고 원래 에러 처리 흐름을 따른다.
  }
}

async function fetchWithAuth(
  url: string,
  body: string,
  isAuthenticated: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    credentials: 'include',
    signal,
  };

  const response = await fetch(url, requestInit);

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return fetch(url, requestInit);
    }

    if (!isAuthenticated) {
      await clearExpiredServerSession();
      return fetch(url, requestInit);
    }
  }

  return response;
}

function handleSseData(
  event: string,
  rawData: string,
  callbacks: ChatStreamCallbacks,
) {
  try {
    const data: unknown = JSON.parse(rawData);

    switch (event) {
      case 'text':
        if (isRecord(data) && typeof data.content === 'string') {
          callbacks.onText(data.content);
        }
        break;
      case 'reset':
        callbacks.onReset();
        break;
      case 'recommendations':
        if (
          isRecord(data) &&
          isChatRecommendationArray(data.recommendations)
        ) {
          callbacks.onRecommendations(data.recommendations);
        }
        break;
      case 'done':
        callbacks.onDone();
        break;
      case 'error':
        if (isRecord(data) && typeof data.message === 'string') {
          callbacks.onError(data.message);
        }
        break;
    }
  } catch {
    // JSON 파싱 실패 무시
  }
}

function handleSseLine(
  line: string,
  currentEvent: string,
  callbacks: ChatStreamCallbacks,
): string {
  const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line;

  if (normalizedLine.startsWith('event: ')) {
    return normalizedLine.slice(7);
  }

  if (normalizedLine.startsWith('data: ')) {
    handleSseData(currentEvent, normalizedLine.slice(6), callbacks);
  }

  return currentEvent;
}

export async function sendChatMessage(
  content: string,
  history: ChatHistoryMessage[],
  callbacks: ChatStreamCallbacks,
  options: ChatRequestOptions = {},
): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const isAuthenticated = options.isAuthenticated ?? false;
  let hasTerminalEvent = false;
  const guardedCallbacks: ChatStreamCallbacks = {
    onText: (text) => {
      if (!hasTerminalEvent) callbacks.onText(text);
    },
    onReset: () => {
      if (!hasTerminalEvent) callbacks.onReset();
    },
    onRecommendations: (recommendations) => {
      if (!hasTerminalEvent) callbacks.onRecommendations(recommendations);
    },
    onDone: () => {
      if (hasTerminalEvent) return;
      hasTerminalEvent = true;
      callbacks.onDone();
    },
    onError: (message) => {
      if (hasTerminalEvent) return;
      hasTerminalEvent = true;
      callbacks.onError(message);
    },
  };

  const response = await fetchWithAuth(
    `${apiUrl}/chat/messages`,
    JSON.stringify({ content, history }),
    isAuthenticated,
    options.signal,
  );

  if (!response.ok) {
    if (response.status === 401) {
      if (isAuthenticated && typeof window !== 'undefined') {
        notifyAuthRequired();
      }
      callbacks.onError(
        isAuthenticated
          ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
          : '로그인이 필요합니다. 다시 로그인해주세요.',
      );
      return;
    }
    if (response.status === 429) {
      callbacks.onError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    callbacks.onError('메시지 전송에 실패했습니다.');
    return;
  }

  if (!response.body) {
    callbacks.onError('서버 응답을 읽을 수 없습니다.');
    return;
  }

  const reader = response.body.getReader();
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
      currentEvent = handleSseLine(line, currentEvent, guardedCallbacks);
    }
  }

  // 스트림 종료 후 버퍼에 남은 데이터 처리
  if (buffer.trim()) {
    const remainingLines = buffer.split('\n');
    for (const line of remainingLines) {
      currentEvent = handleSseLine(line, currentEvent, guardedCallbacks);
    }
  }

  if (!hasTerminalEvent) {
    guardedCallbacks.onError(
      '응답 연결이 예기치 않게 종료되었습니다. 다시 시도해주세요.',
    );
  }
}
