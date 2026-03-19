'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sparkles, MessageSquare, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { sendChatMessage } from '@/lib/chat-stream';
import ChatMessageBubble from './ChatMessageBubble';
import ChatInput from './ChatInput';
import StreamingText from './StreamingText';
import RecommendationCards from './RecommendationCards';
import ChatSessionList from './ChatSessionList';
import type { ChatSession, ChatMessageData, ChatRecommendationWithPoster } from '@/types/chat';

const EXAMPLE_QUESTIONS = [
  '비 오는 날에 볼 만한 잔잔한 영화',
  '친구들이랑 볼 코미디 추천해줘',
  '요즘 핫한 넷플릭스 시리즈 뭐가 있어?',
  '밤에 혼자 볼 스릴러 추천',
];

export default function ChatPage() {
  const { user, openAuthModal } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingRecs, setStreamingRecs] = useState<ChatRecommendationWithPoster[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // onDone 콜백에서 최신 streaming 상태를 참조하기 위한 ref
  const streamingTextRef = useRef('');
  const streamingRecsRef = useRef<ChatRecommendationWithPoster[] | null>(null);

  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  useEffect(() => {
    streamingRecsRef.current = streamingRecs;
  }, [streamingRecs]);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // 세션 목록 로드
  const loadSessions = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<ChatSession[]>('/chat/sessions');
      setSessions(res.data);
    } catch {
      // 세션 목록 로드 실패 무시
    }
  }, [user]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 세션 메시지 이력 로드
  const loadMessages = useCallback(async (targetSessionId: number) => {
    try {
      setError(null);
      const res = await api.get<ChatMessageData[]>(`/chat/sessions/${targetSessionId}/messages`);
      setMessages(res.data);
    } catch {
      setError('메시지 이력을 불러오지 못했습니다.');
    }
  }, []);

  // URL에서 세션 ID 복원
  useEffect(() => {
    const sid = searchParams.get('session');
    if (sid && user) {
      const parsed = parseInt(sid, 10);
      if (!isNaN(parsed)) {
        setSessionId(parsed);
        loadMessages(parsed);
      }
    }
  }, [searchParams, user, loadMessages]);

  const createSession = async (): Promise<number> => {
    const res = await api.post<{ id: number }>('/chat/sessions');
    const newSessionId = res.data.id;
    setSessionId(newSessionId);
    router.replace(`/chat?session=${newSessionId}`, { scroll: false });
    await loadSessions();
    return newSessionId;
  };

  const handleSelectSession = async (targetSessionId: number) => {
    if (targetSessionId === sessionId) {
      setShowSidebar(false);
      return;
    }
    setSessionId(targetSessionId);
    router.replace(`/chat?session=${targetSessionId}`, { scroll: false });
    setMessages([]);
    setStreamingText('');
    setStreamingRecs(null);
    setError(null);
    setIsStreaming(false);
    await loadMessages(targetSessionId);
    setShowSidebar(false);
  };

  const handleDeleteSession = async (targetSessionId: number) => {
    try {
      await api.delete(`/chat/sessions/${targetSessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));
      if (sessionId === targetSessionId) {
        setSessionId(null);
        setMessages([]);
        setStreamingText('');
        setStreamingRecs(null);
        setError(null);
      }
    } catch {
      // 삭제 실패 무시
    }
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setStreamingText('');
    setStreamingRecs(null);
    setError(null);
    setIsStreaming(false);
    setShowSidebar(false);
    router.replace('/chat', { scroll: false });
  };

  const handleSend = async (content: string) => {
    if (!user) {
      openAuthModal();
      return;
    }

    setError(null);

    // 세션이 없으면 생성
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        currentSessionId = await createSession();
      } catch {
        setError('세션 생성에 실패했습니다. 다시 시도해주세요.');
        return;
      }
    }

    // 낙관적 UI: 사용자 메시지 추가
    const userMessage: ChatMessageData = {
      id: Date.now(),
      role: 'user',
      content,
      recommendations: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingText('');
    setStreamingRecs(null);

    try {
      await sendChatMessage(currentSessionId, content, {
        onText: (text) => {
          setStreamingText((prev) => prev + text);
        },
        onRecommendations: (recs) => {
          setStreamingRecs(recs);
        },
        onDone: (messageId) => {
          // 스트리밍 완료: 정식 메시지로 추가
          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              role: 'assistant',
              content: streamingTextRef.current,
              recommendations: streamingRecsRef.current,
              createdAt: new Date().toISOString(),
            },
          ]);
          setIsStreaming(false);
          setStreamingText('');
          setStreamingRecs(null);
          // 세션 목록 갱신 (title 업데이트 반영)
          loadSessions();
        },
        onError: (message) => {
          setError(message);
          setIsStreaming(false);
          setStreamingText('');
          setStreamingRecs(null);
        },
      });
    } catch {
      setError('메시지 전송 중 오류가 발생했습니다.');
      setIsStreaming(false);
      setStreamingText('');
      setStreamingRecs(null);
    }
  };

  const handleExampleClick = (question: string) => {
    handleSend(question);
  };

  const hasConversation = messages.length > 0 || isStreaming;

  return (
    <div className="mx-auto w-full max-w-7xl flex h-[calc(100dvh-80px)]">
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col border-r border-white/10 bg-black/30">
        <ChatSessionList
          sessions={sessions}
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onNewChat={handleNewChat}
        />
      </aside>

      {/* 모바일 드로어 오버레이 */}
      {showSidebar && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* 모바일 드로어 */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 flex-col border-r border-white/10 bg-[#0a0a0a] transition-transform duration-300 md:hidden ${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white">대화 목록</span>
          <button
            onClick={() => setShowSidebar(false)}
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="사이드바 닫기"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <ChatSessionList
          sessions={sessions}
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onNewChat={handleNewChat}
        />
      </aside>

      {/* 채팅 메인 영역 */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* 모바일 상단 바 */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 md:hidden">
          <button
            onClick={() => setShowSidebar(true)}
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="사이드바 열기"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-white/70 truncate">
            {sessionId ? (sessions.find((s) => s.id === sessionId)?.title || '새 대화') : 'AI 추천'}
          </span>
        </div>

        {/* 메시지 영역 */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 py-6"
        >
          {!hasConversation ? (
            /* 환영 메시지 + 예시 질문 */
            <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-700/20 to-indigo-600/20 border border-fuchsia-500/20 mb-6">
                <Sparkles className="w-8 h-8 text-fuchsia-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                오늘 뭐 볼까?
              </h2>
              <p className="text-sm text-white/50 mb-8">
                취향에 맞는 영화와 시리즈를 추천해드릴게요.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    onClick={() => handleExampleClick(question)}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                  >
                    <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-fuchsia-400/60" />
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 대화 메시지 목록 */
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}

              {/* 스트리밍 중인 AI 응답 */}
              {isStreaming && (streamingText || streamingRecs) && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 bg-white/5 border border-white/10">
                    {streamingText && (
                      <StreamingText text={streamingText} />
                    )}
                    {streamingRecs && streamingRecs.length > 0 && (
                      <RecommendationCards recommendations={streamingRecs} />
                    )}
                  </div>
                </div>
              )}

              {/* 스트리밍 중이나 아직 텍스트가 없을 때 로딩 표시 */}
              {isStreaming && !streamingText && !streamingRecs && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-3 bg-white/5 border border-white/10">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="px-4 pb-2">
            <div className="max-w-2xl mx-auto rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          </div>
        )}

        {/* 입력 영역 */}
        <div className="px-4 pb-4 pt-2">
          <div className="max-w-2xl mx-auto">
            <ChatInput onSend={handleSend} disabled={isStreaming} />
            <p className="mt-2 text-center text-[11px] text-white/30">
              AI가 추천한 정보는 정확하지 않을 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
