import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import UserAvatar from '@/components/common/UserAvatar';

describe('UserAvatar', () => {
  it('닉네임 첫 글자를 대문자로 표시한다', () => {
    render(<UserAvatar user={{ nickname: '테스트' }} />);
    expect(screen.getByText('테')).toBeInTheDocument();
  });

  it('영문 닉네임 첫 글자를 대문자로 표시한다', () => {
    render(<UserAvatar user={{ nickname: 'hello' }} />);
    expect(screen.getByText('H')).toBeInTheDocument();
  });

  it('삭제된 사용자는 ?를 표시한다', () => {
    render(<UserAvatar user={{ nickname: '테스트', status: 'DELETED' }} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('null 사용자는 ?를 표시한다', () => {
    render(<UserAvatar user={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('size="sm"일 때 h-6 w-6 클래스를 적용한다', () => {
    const { container } = render(<UserAvatar user={{ nickname: '테스트' }} size="sm" />);
    expect(container.firstChild).toHaveClass('h-6', 'w-6');
  });

  it('size="lg"일 때 h-8 w-8 클래스를 적용한다', () => {
    const { container } = render(<UserAvatar user={{ nickname: '테스트' }} size="lg" />);
    expect(container.firstChild).toHaveClass('h-8', 'w-8');
  });

  it('기본 size는 md이다', () => {
    const { container } = render(<UserAvatar user={{ nickname: '테스트' }} />);
    expect(container.firstChild).toHaveClass('h-7', 'w-7');
  });
});
