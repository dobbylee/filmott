import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import FloatingOpenChat from '@/components/layout/FloatingOpenChat';

describe('FloatingOpenChat', () => {
  it('전역 오픈채팅 링크를 새 탭으로 제공해야 한다', () => {
    render(<FloatingOpenChat />);

    const link = screen.getByRole('link', {
      name: 'Filmott 오픈채팅 참여',
    });
    expect(link).toHaveAttribute('href', 'https://open.kakao.com/o/gF5pAlli');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('스크롤과 safe-area에 관계없이 우하단에 표시해야 한다', () => {
    render(<FloatingOpenChat />);

    const link = screen.getByRole('link', {
      name: 'Filmott 오픈채팅 참여',
    });
    expect(link).toHaveClass(
      'fixed',
      'bottom-[max(1rem,env(safe-area-inset-bottom))]',
      'right-[max(1rem,env(safe-area-inset-right))]',
      'z-50',
    );
    expect(screen.getByText('오픈채팅')).toBeVisible();
  });
});
