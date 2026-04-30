import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessageBubble from '@/components/chat/ChatMessageBubble';
import type { ChatMessageData } from '@/types/chat';

// mock RecommendationCards
vi.mock('@/components/chat/RecommendationCards', () => ({
  default: ({ recommendations }: { recommendations: unknown[] }) => (
    <div data-testid="recommendation-cards">
      {recommendations.length}개 추천
    </div>
  ),
}));

describe('ChatMessageBubble', () => {
  const userMessage: ChatMessageData = {
    id: 1,
    role: 'user',
    content: '비 오는 날 영화 추천해줘',
    recommendations: null,
    createdAt: '2026-03-19T12:00:00Z',
  };

  const assistantMessage: ChatMessageData = {
    id: 2,
    role: 'assistant',
    content: '비 오는 날에 어울리는 영화를 추천해드릴게요.',
    recommendations: null,
    createdAt: '2026-03-19T12:00:01Z',
  };

  const assistantMessageWithRecs: ChatMessageData = {
    id: 3,
    role: 'assistant',
    content: '다음 작품들을 추천해드려요.',
    recommendations: [
      { tmdbId: 496243, contentType: 'movie', title: '기생충', posterUrl: null },
    ],
    createdAt: '2026-03-19T12:00:02Z',
  };

  it('사용자 메시지를 렌더링한다', () => {
    render(<ChatMessageBubble message={userMessage} />);
    expect(screen.getByText('비 오는 날 영화 추천해줘')).toBeInTheDocument();
  });

  it('사용자 메시지에 bg-fuchsia 스타일이 적용된다', () => {
    const { container } = render(<ChatMessageBubble message={userMessage} />);
    const bubble = container.querySelector('.bg-fuchsia-700\\/20');
    expect(bubble).toBeInTheDocument();
  });

  it('어시스턴트 메시지를 렌더링한다', () => {
    render(<ChatMessageBubble message={assistantMessage} />);
    expect(screen.getByText('비 오는 날에 어울리는 영화를 추천해드릴게요.')).toBeInTheDocument();
  });

  it('어시스턴트 메시지에 bg-white/5 스타일이 적용된다', () => {
    const { container } = render(<ChatMessageBubble message={assistantMessage} />);
    const bubble = container.querySelector('.bg-white\\/5');
    expect(bubble).toBeInTheDocument();
  });

  it('추천이 있는 어시스턴트 메시지에서 RecommendationCards를 렌더링한다', () => {
    render(<ChatMessageBubble message={assistantMessageWithRecs} />);
    expect(screen.getByTestId('recommendation-cards')).toBeInTheDocument();
    expect(screen.getByText('1개 추천')).toBeInTheDocument();
  });

  it('추천이 없는 어시스턴트 메시지에서 RecommendationCards를 렌더링하지 않는다', () => {
    render(<ChatMessageBubble message={assistantMessage} />);
    expect(screen.queryByTestId('recommendation-cards')).not.toBeInTheDocument();
  });

  it('사용자 메시지에서 RecommendationCards를 렌더링하지 않는다', () => {
    render(<ChatMessageBubble message={userMessage} />);
    expect(screen.queryByTestId('recommendation-cards')).not.toBeInTheDocument();
  });
});
