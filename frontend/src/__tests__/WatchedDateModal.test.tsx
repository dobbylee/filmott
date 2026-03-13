import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WatchedDateModal from '@/components/watchlist/WatchedDateModal';

describe('WatchedDateModal', () => {
  it('ESC 키를 누르면 onCancel이 호출된다', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<WatchedDateModal onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('감상 날짜 타이틀을 표시한다', () => {
    render(<WatchedDateModal onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('감상 날짜')).toBeInTheDocument();
  });

  it('확인 버튼 클릭 시 onConfirm이 날짜와 함께 호출된다', () => {
    const onConfirm = vi.fn();
    render(<WatchedDateModal onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText('확인'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(typeof onConfirm.mock.calls[0][0]).toBe('string');
  });
});
