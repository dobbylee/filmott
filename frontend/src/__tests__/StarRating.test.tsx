import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StarRating from '@/components/review/StarRating';

describe('StarRating', () => {
  it('10개의 별점 버튼을 렌더링한다', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(10);
  });

  it('별점 클릭 시 onChange가 호출된다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    await user.click(screen.getByLabelText('5점'));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('현재 값을 텍스트로 표시한다', () => {
    render(<StarRating value={7} onChange={vi.fn()} />);
    expect(screen.getByText('7점')).toBeInTheDocument();
  });

  it('값이 0일 때 점수 텍스트를 표시하지 않는다', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    expect(screen.queryByText(/점$/)).not.toBeInTheDocument();
  });
});
