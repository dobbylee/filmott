import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorWithRetry from '@/components/common/ErrorWithRetry';

describe('ErrorWithRetry', () => {
  it('메시지를 렌더링한다', () => {
    render(<ErrorWithRetry message="작품 정보를 불러올 수 없습니다." />);
    expect(screen.getByText('작품 정보를 불러올 수 없습니다.')).toBeInTheDocument();
  });

  it('타이틀이 있으면 표시한다', () => {
    render(<ErrorWithRetry title="리뷰" message="리뷰를 불러올 수 없습니다." />);
    expect(screen.getByText('리뷰')).toBeInTheDocument();
    expect(screen.getByText('리뷰를 불러올 수 없습니다.')).toBeInTheDocument();
  });

  it('타이틀이 없으면 타이틀을 렌더링하지 않는다', () => {
    render(<ErrorWithRetry message="에러 메시지" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('다시 시도 버튼을 렌더링한다', () => {
    render(<ErrorWithRetry message="에러" />);
    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  it('다시 시도 버튼 클릭 시 페이지를 리로드한다', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(<ErrorWithRetry message="에러" />);
    screen.getByText('다시 시도').click();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('retry handler가 있으면 페이지 리로드 대신 handler를 호출한다', () => {
    const onRetry = vi.fn();
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(<ErrorWithRetry message="에러" onRetry={onRetry} />);
    screen.getByText('다시 시도').click();

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
