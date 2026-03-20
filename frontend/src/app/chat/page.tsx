import type { Metadata } from 'next';
import { Suspense } from 'react';
import ChatPage from '@/components/chat/ChatPage';

export const metadata: Metadata = {
  title: '추천받기',
  description: 'AI가 취향에 맞는 영화와 시리즈를 추천해드립니다.',
};

export default function ChatPageRoute() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
