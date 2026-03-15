'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW 등록 실패 시 조용히 무시 (PWA 미지원 브라우저에서도 앱 정상 동작)
      });
    }
  }, []);

  return null;
}
