'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/utils/useFocusTrap';
import { getKoreaDateInputValue } from '@/utils/date';

interface WatchedDateModalProps {
  onConfirm: (date: string) => void;
  onCancel: () => void;
}

export default function WatchedDateModal({ onConfirm, onCancel }: WatchedDateModalProps) {
  const today = getKoreaDateInputValue();
  const [date, setDate] = useState(today);
  const modalRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div ref={modalRef} onClick={(e) => e.stopPropagation()} className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-[#111] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">감상 날짜</h3>
          <button
            onClick={onCancel}
            className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-white/50">
          이 작품을 감상한 날짜를 선택해주세요.
        </p>

        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="mb-6 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 [color-scheme:dark]"
        />

        <div className="flex gap-3">
          <button
            onClick={() => onConfirm(date)}
            className="flex-1 rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
          >
            확인
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-all"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
