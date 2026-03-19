import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatSessionList from '@/components/chat/ChatSessionList';
import type { ChatSession } from '@/types/chat';

describe('ChatSessionList', () => {
  const mockOnSelectSession = vi.fn();
  const mockOnDeleteSession = vi.fn();
  const mockOnNewChat = vi.fn();

  const mockSessions: ChatSession[] = [
    {
      id: 1,
      title: '비 오는 날 영화 추천',
      updatedAt: new Date().toISOString(),
      lastMessage: '좋은 영화를 골라봤어요.',
    },
    {
      id: 2,
      title: '코미디 추천해줘',
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      lastMessage: '코미디 영화 목록입니다.',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 목록을 렌더링해야 한다', () => {
    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId={null}
        onSelectSession={mockOnSelectSession}
        onDeleteSession={mockOnDeleteSession}
        onNewChat={mockOnNewChat}
      />,
    );

    expect(screen.getByText('비 오는 날 영화 추천')).toBeInTheDocument();
    expect(screen.getByText('코미디 추천해줘')).toBeInTheDocument();
    expect(screen.getByText('좋은 영화를 골라봤어요.')).toBeInTheDocument();
  });

  it('세션이 없을 때 빈 상태를 표시해야 한다', () => {
    render(
      <ChatSessionList
        sessions={[]}
        activeSessionId={null}
        onSelectSession={mockOnSelectSession}
        onDeleteSession={mockOnDeleteSession}
        onNewChat={mockOnNewChat}
      />,
    );

    expect(screen.getByText('대화 기록이 없습니다')).toBeInTheDocument();
  });

  it('새 대화 버튼을 클릭하면 onNewChat을 호출해야 한다', async () => {
    const user = userEvent.setup();

    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId={null}
        onSelectSession={mockOnSelectSession}
        onDeleteSession={mockOnDeleteSession}
        onNewChat={mockOnNewChat}
      />,
    );

    await user.click(screen.getByText('새 대화'));
    expect(mockOnNewChat).toHaveBeenCalledTimes(1);
  });

  it('세션 클릭 시 onSelectSession을 호출해야 한다', async () => {
    const user = userEvent.setup();

    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId={null}
        onSelectSession={mockOnSelectSession}
        onDeleteSession={mockOnDeleteSession}
        onNewChat={mockOnNewChat}
      />,
    );

    await user.click(screen.getByText('비 오는 날 영화 추천'));
    expect(mockOnSelectSession).toHaveBeenCalledWith(1);
  });

  it('활성 세션에 하이라이트 스타일을 적용해야 한다', () => {
    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId={1}
        onSelectSession={mockOnSelectSession}
        onDeleteSession={mockOnDeleteSession}
        onNewChat={mockOnNewChat}
      />,
    );

    const activeItem = screen.getByText('비 오는 날 영화 추천').closest('[role="button"]');
    expect(activeItem?.className).toContain('bg-white/10');
  });

  it('삭제 버튼 클릭 시 onDeleteSession을 호출해야 한다', async () => {
    const user = userEvent.setup();

    render(
      <ChatSessionList
        sessions={mockSessions}
        activeSessionId={null}
        onSelectSession={mockOnSelectSession}
        onDeleteSession={mockOnDeleteSession}
        onNewChat={mockOnNewChat}
      />,
    );

    const deleteButtons = screen.getAllByLabelText(/삭제$/);
    await user.click(deleteButtons[0]);
    expect(mockOnDeleteSession).toHaveBeenCalledWith(1);
  });
});
