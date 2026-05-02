import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContentDetailError from '@/app/contents/[type]/[tmdbId]/error';

describe('ContentDetailError', () => {
  it('작품 정보 로딩 실패 메시지와 재시도 버튼을 표시한다', () => {
    render(<ContentDetailError reset={vi.fn()} />);

    expect(
      screen.getByText('작품 정보를 불러올 수 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  it('다시 시도 버튼 클릭 시 error boundary reset을 호출해야 한다', () => {
    const reset = vi.fn();

    render(<ContentDetailError reset={reset} />);
    screen.getByText('다시 시도').click();

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
