import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommentList from '@/components/review/CommentList';
import type { Comment } from '@/types/comment';

describe('CommentList', () => {
  const comments: Comment[] = [
    {
      id: 1,
      userId: 10,
      content: '좋은 리뷰입니다.',
      createdAt: '2024-12-25T12:00:00Z',
      user: { id: 10, nickname: '테스트유저' },
    },
    {
      id: 2,
      userId: 20,
      content: '동감합니다.',
      createdAt: '2024-12-25T13:00:00Z',
      user: { id: 20, nickname: '다른유저' },
    },
  ];

  it('댓글 목록을 렌더링한다', () => {
    render(
      <CommentList
        comments={comments}
        isLoading={false}
        page={1}
        totalPages={1}
        onLoadMore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('좋은 리뷰입니다.')).toBeInTheDocument();
    expect(screen.getByText('동감합니다.')).toBeInTheDocument();
  });

  it('로딩 중일 때 메시지를 표시한다', () => {
    render(
      <CommentList
        comments={[]}
        isLoading={true}
        page={1}
        totalPages={1}
        onLoadMore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
  });

  it('댓글이 없을 때 빈 메시지를 표시한다', () => {
    render(
      <CommentList
        comments={[]}
        isLoading={false}
        page={1}
        totalPages={1}
        onLoadMore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('아직 댓글이 없습니다.')).toBeInTheDocument();
  });

  it('현재 사용자의 댓글에 삭제 버튼을 표시한다', () => {
    render(
      <CommentList
        comments={comments}
        currentUserId={10}
        isLoading={false}
        page={1}
        totalPages={1}
        onLoadMore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const deleteButtons = screen.getAllByLabelText('댓글 삭제');
    expect(deleteButtons).toHaveLength(1);
  });

  it('삭제 버튼 클릭 시 onDelete가 호출된다', () => {
    const onDelete = vi.fn();
    render(
      <CommentList
        comments={comments}
        currentUserId={10}
        isLoading={false}
        page={1}
        totalPages={1}
        onLoadMore={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('댓글 삭제'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('더보기 버튼을 표시한다 (page < totalPages)', () => {
    render(
      <CommentList
        comments={comments}
        isLoading={false}
        page={1}
        totalPages={3}
        onLoadMore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('더보기')).toBeInTheDocument();
  });

  it('마지막 페이지에서 더보기 버튼을 숨긴다', () => {
    render(
      <CommentList
        comments={comments}
        isLoading={false}
        page={3}
        totalPages={3}
        onLoadMore={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText('더보기')).not.toBeInTheDocument();
  });
});
