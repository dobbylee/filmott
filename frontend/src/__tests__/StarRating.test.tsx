import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StarRating from '@/components/review/StarRating';

describe('StarRating', () => {
  it('별점 선택 슬라이더를 렌더링한다', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);

    const slider = screen.getByRole('slider', { name: '별점 선택' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '10');
    expect(slider).toHaveAttribute('step', '1');
  });

  it('슬라이더 값 변경 시 onChange가 호출된다', () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    fireEvent.change(screen.getByRole('slider', { name: '별점 선택' }), {
      target: { value: '5' },
    });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('현재 값을 텍스트로 표시한다', () => {
    render(<StarRating value={7} onChange={vi.fn()} />);
    expect(screen.getByText('7점')).toBeInTheDocument();
  });

  it('값이 0일 때 0점을 표시한다', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    expect(screen.getByText('0점')).toBeInTheDocument();
    expect(screen.queryByText('선택 안 함')).not.toBeInTheDocument();
  });

  it('aria-valuetext로 현재 선택 상태를 제공한다', () => {
    render(<StarRating value={3} onChange={vi.fn()} />);
    expect(screen.getByRole('slider', { name: '별점 선택' })).toHaveAttribute(
      'aria-valuetext',
      '3점',
    );
  });

  it('0점 상태의 aria-valuetext를 제공한다', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    expect(screen.getByRole('slider', { name: '별점 선택' })).toHaveAttribute(
      'aria-valuetext',
      '0점',
    );
  });
});
