import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StarRating from '@/components/review/StarRating';

describe('StarRating', () => {
  it('10개의 별점 라디오 버튼을 렌더링한다', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(10);
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

  it('radiogroup role과 aria-label을 가진다', () => {
    render(<StarRating value={3} onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: '별점 선택' })).toBeInTheDocument();
  });

  it('선택된 값의 aria-checked가 true이다', () => {
    render(<StarRating value={5} onChange={vi.fn()} />);
    const selected = screen.getByLabelText('5점');
    expect(selected).toHaveAttribute('aria-checked', 'true');
    const unselected = screen.getByLabelText('3점');
    expect(unselected).toHaveAttribute('aria-checked', 'false');
  });

  it('ArrowRight 키로 다음 별점을 선택한다', () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} />);
    const star5 = screen.getByLabelText('5점');
    fireEvent.keyDown(star5, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('ArrowLeft 키로 이전 별점을 선택한다', () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} />);
    const star5 = screen.getByLabelText('5점');
    fireEvent.keyDown(star5, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('1점에서 ArrowLeft는 동작하지 않는다', () => {
    const onChange = vi.fn();
    render(<StarRating value={1} onChange={onChange} />);
    const star1 = screen.getByLabelText('1점');
    fireEvent.keyDown(star1, { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('최대 점수에서 ArrowRight는 동작하지 않는다', () => {
    const onChange = vi.fn();
    render(<StarRating value={10} onChange={onChange} />);
    const star10 = screen.getByLabelText('10점');
    fireEvent.keyDown(star10, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
