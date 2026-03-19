'use client';

import ReactMarkdown from 'react-markdown';
import RecommendationCards from './RecommendationCards';
import type { ChatMessageData } from '@/types/chat';

interface ChatMessageBubbleProps {
  message: ChatMessageData;
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-fuchsia-700/20 border border-fuchsia-500/20'
            : 'bg-white/5 border border-white/10'
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="text-sm leading-relaxed text-white/90 prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-white">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {!isUser && message.recommendations && message.recommendations.length > 0 && (
          <RecommendationCards recommendations={message.recommendations} />
        )}
      </div>
    </div>
  );
}
