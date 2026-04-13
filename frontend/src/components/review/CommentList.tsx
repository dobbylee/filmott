'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import UserAvatar from '@/components/common/UserAvatar';
import { getDisplayNickname, isInactiveUser } from '@/utils/user';
import { formatCommentDate } from '@/utils/date';
import type { Comment } from '@/types/comment';

interface CommentListProps {
  comments: Comment[];
  currentUserId?: number;
  currentUserRole?: string;
  isLoading: boolean;
  page: number;
  totalPages: number;
  onLoadMore: (page: number) => void;
  onDelete: (commentId: number) => void;
}

export default function CommentList({
  comments,
  currentUserId,
  currentUserRole,
  isLoading,
  page,
  totalPages,
  onLoadMore,
  onDelete,
}: CommentListProps) {
  if (isLoading && comments.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">불러오는 중...</p>;
  }

  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">아직 댓글이 없습니다.</p>;
  }

  return (
    <div className="divide-y divide-white/[0.06]">
      {comments.map((c) => (
        <div key={c.id} className="flex items-start gap-3 px-2 py-3 hover:bg-white/[0.03] transition-colors">
          <UserAvatar user={c.user} size="md" linkToProfile={!isInactiveUser(c.user)} userId={c.userId} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isInactiveUser(c.user) ? (
                <span className="text-sm font-medium text-muted-foreground">
                  {getDisplayNickname(c.user)}
                </span>
              ) : (
                <Link href={`/profile/${c.userId}`} className="text-sm font-medium hover:text-fuchsia-400 transition-colors">
                  {getDisplayNickname(c.user)}
                </Link>
              )}
              <span className="text-[11px] text-muted-foreground">
                {formatCommentDate(c.createdAt)}
              </span>
              {currentUserId && (currentUserId === c.userId || currentUserRole === 'ADMIN') && (
                <button
                  onClick={() => onDelete(c.id)}
                  className="ml-auto p-2 -m-1 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="댓글 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-sm text-white/70 mt-1 leading-relaxed">{c.content}</p>
          </div>
        </div>
      ))}
      {page < totalPages && (
        <button
          onClick={() => onLoadMore(page + 1)}
          disabled={isLoading}
          className="w-full py-2 text-xs text-primary hover:underline disabled:opacity-50"
        >
          {isLoading ? '불러오는 중...' : '더보기'}
        </button>
      )}
    </div>
  );
}
