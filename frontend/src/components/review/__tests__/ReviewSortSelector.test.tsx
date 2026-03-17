import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReviewSortSelector from '@/components/review/ReviewSortSelector';

describe('ReviewSortSelector', () => {
  it('최신순과 인기순 탭을 렌더링한다', () => {
    render(<ReviewSortSelector sort="latest" onSortChange={() => {}} />);

    expect(screen.getByText('최신순')).toBeInTheDocument();
    expect(screen.getByText('인기순')).toBeInTheDocument();
  });

  it('현재 선택된 탭에 활성 스타일이 적용된다', () => {
    render(<ReviewSortSelector sort="latest" onSortChange={() => {}} />);

    const latestBtn = screen.getByText('최신순');
    const likesBtn = screen.getByText('인기순');

    expect(latestBtn.className).toContain('bg-white/15');
    expect(likesBtn.className).not.toContain('bg-white/15');
  });

  it('인기순 선택 시 활성 스타일이 변경된다', () => {
    render(<ReviewSortSelector sort="likes" onSortChange={() => {}} />);

    const latestBtn = screen.getByText('최신순');
    const likesBtn = screen.getByText('인기순');

    expect(latestBtn.className).not.toContain('bg-white/15');
    expect(likesBtn.className).toContain('bg-white/15');
  });

  it('탭 클릭 시 onSortChange가 올바른 값으로 호출된다', () => {
    const onSortChange = vi.fn();
    render(<ReviewSortSelector sort="latest" onSortChange={onSortChange} />);

    fireEvent.click(screen.getByText('인기순'));
    expect(onSortChange).toHaveBeenCalledWith('likes');

    fireEvent.click(screen.getByText('최신순'));
    expect(onSortChange).toHaveBeenCalledWith('latest');
  });
});
