'use client';

import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <WifiOff className="mx-auto h-16 w-16 text-white/20" />
        <h1 className="mt-4 text-2xl font-bold text-white/80">오프라인 상태입니다</h1>
        <p className="mt-2 text-sm text-white/50">
          인터넷 연결을 확인한 후 다시 시도해주세요.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 inline-block rounded-lg bg-gradient-to-r from-fuchsia-700 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
