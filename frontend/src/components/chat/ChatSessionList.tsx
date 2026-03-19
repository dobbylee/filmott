'use client';

import { useState } from 'react';
import { Plus, X as XIcon, MessageSquare } from 'lucide-react';
import type { ChatSession } from '@/types/chat';

interface ChatSessionListProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  onSelectSession: (sessionId: number) => void;
  onDeleteSession: (sessionId: number) => void;
  onNewChat: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

export default function ChatSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
}: ChatSessionListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      onDeleteSession(sessionId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 새 대화 버튼 */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" />
          새 대화
        </button>
      </div>

      {/* 세션 목록 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="w-8 h-8 text-white/20 mb-2" />
            <p className="text-xs text-white/40">대화 기록이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectSession(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSession(session.id);
                  }
                }}
                className={`group flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left cursor-pointer transition-colors ${
                  activeSessionId === session.id
                    ? 'bg-white/10 border border-white/10'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {session.title || '새 대화'}
                  </p>
                  {session.lastMessage && (
                    <p className="mt-0.5 text-xs text-white/40 truncate">
                      {session.lastMessage}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-white/30">
                    {formatTimeAgo(session.updatedAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  disabled={deletingId === session.id}
                  className="flex-shrink-0 mt-0.5 flex items-center justify-center w-6 h-6 rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                  aria-label={`${session.title || '새 대화'} 삭제`}
                >
                  {deletingId === session.id ? (
                    <span className="w-3 h-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
                  ) : (
                    <XIcon className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
