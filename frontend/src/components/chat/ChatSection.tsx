'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, MessageSquare, Plus } from 'lucide-react';
import { sendChatMessage } from '@/lib/chat-stream';
import type { ChatHistoryMessage } from '@/lib/chat-stream';
import ChatMessageBubble from './ChatMessageBubble';
import ChatInput from './ChatInput';
import StreamingText from './StreamingText';
import RecommendationCards from './RecommendationCards';
import type { ChatMessageData, ChatRecommendationWithPoster } from '@/types/chat';
import { trackEvent } from '@/lib/ga';

const STORAGE_KEY = 'filmott_chat_messages';
const MAX_STORED_MESSAGES = 50;
const MAX_HISTORY_MESSAGES = 20;

const EXAMPLE_QUESTIONS = [
  '넷플릭스에서 볼 수 있는 최신 드라마 추천해줘',
  '친구들이랑 볼 코미디 영화 추천해줘',
  '통쾌한 액션 영화 추천해줘',
  '밤에 혼자 볼 스릴러 영화 추천해줘',
];

export default function ChatSection() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingRecs, setStreamingRecs] = useState<ChatRecommendationWithPoster[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // onDone 콜백에서 최신 streaming 상태를 참조하기 위한 ref
  const streamingTextRef = useRef('');
  const streamingRecsRef = useRef<ChatRecommendationWithPoster[] | null>(null);
  // onDone 이중 호출 방지 플래그
  const isDoneCalledRef = useRef(false);

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
    if (messages.length > 0 || isStreaming) {
      scrollToBottom();
    }
  }, [messages, streamingText, isStreaming, scrollToBottom]);

  // localStorage에서 메시지 복원
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (item) =>
              typeof item === 'object' &&
              item !== null &&
              'role' in item &&
              'content' in item &&
              (item.role === 'user' || item.role === 'assistant') &&
              typeof item.content === 'string',
          )
        ) {
          // 최근 50개만 로드
          const validMessages = parsed as ChatMessageData[];
          if (validMessages.length > MAX_STORED_MESSAGES) {
            const trimmed = validMessages.slice(-MAX_STORED_MESSAGES);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
            setMessages(trimmed);
          } else {
            setMessages(validMessages);
          }
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // 메시지 변경 시 자동 저장 (최근 50개 제한)
  useEffect(() => {
    if (messages.length > 0) {
      const toSave = messages.length > MAX_STORED_MESSAGES
        ? messages.slice(-MAX_STORED_MESSAGES)
        : messages;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }
  }, [messages]);

  const handleNewChat = () => {
    setMessages([]);
    setStreamingText('');
    setStreamingRecs(null);
    setError(null);
    setIsStreaming(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSend = async (content: string) => {
    trackEvent('chat_message_sent', { message_count: messages.length + 1 });
    setError(null);

    // 대화 이력 구성 (최근 20개만 전송, role + content만 추출)
    const history: ChatHistoryMessage[] = messages.slice(-MAX_HISTORY_MESSAGES).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

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
    streamingTextRef.current = '';
    streamingRecsRef.current = null;
    isDoneCalledRef.current = false;

    try {
      await sendChatMessage(content, history, {
        onText: (text) => {
          streamingTextRef.current += text;
          setStreamingText((prev) => prev + text);
        },
        onRecommendations: (recs) => {
          streamingRecsRef.current = recs;
          setStreamingRecs(recs);
        },
        onDone: () => {
          isDoneCalledRef.current = true;
          const cleanedText = streamingTextRef.current;
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              role: 'assistant',
              content: cleanedText,
              recommendations: streamingRecsRef.current,
              createdAt: new Date().toISOString(),
            },
          ]);
          setIsStreaming(false);
          setStreamingText('');
          setStreamingRecs(null);
        },
        onError: (message) => {
          isDoneCalledRef.current = true;
          setError(message);
          setIsStreaming(false);
          setStreamingText('');
          setStreamingRecs(null);
        },
      });

      // onDone이 호출되지 않은 경우 (연결 끊김 등) 받은 텍스트 보존
      if (!isDoneCalledRef.current && streamingTextRef.current) {
        const cleanedText = streamingTextRef.current;
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            content: cleanedText,
            recommendations: streamingRecsRef.current,
            createdAt: new Date().toISOString(),
          },
        ]);
        setIsStreaming(false);
        setStreamingText('');
        setStreamingRecs(null);
      }
    } catch {
      // 에러 시에도 받은 텍스트가 있으면 보존
      if (!isDoneCalledRef.current && streamingTextRef.current) {
        const cleanedText = streamingTextRef.current;
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            content: cleanedText,
            recommendations: streamingRecsRef.current,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else if (!isDoneCalledRef.current) {
        setError('메시지 전송 중 오류가 발생했습니다.');
      }
      setIsStreaming(false);
      setStreamingText('');
      setStreamingRecs(null);
    }
  };

  const handleExampleClick = (question: string) => {
    trackEvent('chat_example_clicked', { question });
    handleSend(question);
  };

  const hasConversation = messages.length > 0 || isStreaming;

  return (
    <section id="chat-section" className="mx-auto w-full max-w-3xl">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-fuchsia-400" />
          <span className="text-sm font-semibold text-white">추천받기</span>
        </div>
        {hasConversation && (
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            새 대화
          </button>
        )}
      </div>

      {/* 대화 없음 - 환영 메시지 + 예시 질문 */}
      {!hasConversation && (
        <div className="px-4 pb-4 flex items-center justify-center" style={{ height: '60vh' }}>
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-700/20 to-indigo-600/20 border border-fuchsia-500/20 mb-4">
              <Sparkles className="w-7 h-7 text-fuchsia-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              오늘 뭐 볼까?
            </h2>
            <p className="text-sm text-white/50 mb-6">
              취향에 맞는 영화와 시리즈를 추천해 드릴게요
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mb-4">
              {EXAMPLE_QUESTIONS.map((question) => (
                <button
                  key={question}
                  onClick={() => handleExampleClick(question)}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all break-keep"
                >
                  <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-fuchsia-400/60" />
                  {question}
                </button>
              ))}
            </div>

            <p className="text-xs text-white/30">
              시청기록, 별점, 리뷰가 쌓일수록 추천 품질이 좋아져요
            </p>
          </div>
        </div>
      )}

      {/* 대화 있음 - 메시지 영역 (고정 높이 + 내부 스크롤) */}
      {hasConversation && (
        <div
          ref={messagesContainerRef}
          className="overflow-y-auto px-4 pb-2"
          style={{ height: '60vh' }}
        >
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
        </div>
      )}

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
    </section>
  );
}
