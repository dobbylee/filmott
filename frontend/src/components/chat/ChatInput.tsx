'use client';

import { useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // max 3줄 (약 72px)
    const maxHeight = 72;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // 높이 리셋 + 모바일 확대 복원
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.blur();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          autoResize();
        }}
        onKeyDown={handleKeyDown}
        placeholder="메시지를 입력하세요."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-base text-white placeholder-white/40 outline-none disabled:opacity-50 leading-6"
        style={{ minHeight: '24px' }}
      />
      <button
        onClick={handleSubmit}
        disabled={!canSend}
        className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-all ${
          canSend
            ? 'bg-gradient-to-br from-fuchsia-700 to-indigo-600 text-white shadow-[0_0_10px_rgba(192,38,211,0.4)] hover:shadow-[0_0_20px_rgba(192,38,211,0.6)]'
            : 'bg-white/5 text-white/20'
        }`}
        aria-label="전송"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
