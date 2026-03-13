import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SectionError from '@/components/common/SectionError';

describe('SectionError', () => {
  it('제목과 에러 메시지를 렌더링한다', () => {
    render(<SectionError title="박스오피스" />);
    expect(screen.getByText('박스오피스')).toBeInTheDocument();
    expect(screen.getByText('데이터를 불러올 수 없습니다.')).toBeInTheDocument();
  });

  it('다시 시도 버튼을 렌더링한다', () => {
    render(<SectionError title="테스트" />);
    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  it('다시 시도 버튼 클릭 시 페이지를 리로드한다', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(<SectionError title="테스트" />);
    screen.getByText('다시 시도').click();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
