import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OfflinePage from '@/app/offline/page';

describe('OfflinePage', () => {
  it('오프라인 안내 메시지를 표시한다', () => {
    render(<OfflinePage />);

    expect(screen.getByText('오프라인 상태입니다')).toBeInTheDocument();
    expect(screen.getByText('인터넷 연결을 확인한 후 다시 시도해주세요.')).toBeInTheDocument();
  });

  it('다시 시도 버튼을 표시한다', () => {
    render(<OfflinePage />);

    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('다시 시도 버튼 클릭 시 페이지를 새로고침한다', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      configurable: true,
      writable: true,
    });

    render(<OfflinePage />);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reloadMock).toHaveBeenCalled();
  });

  it('WifiOff 아이콘을 렌더링한다', () => {
    const { container } = render(<OfflinePage />);

    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();
  });

  it('고정 배치(fixed)로 전체 화면을 덮는다', () => {
    const { container } = render(<OfflinePage />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('fixed');
    expect(wrapper.className).toContain('inset-0');
    expect(wrapper.className).toContain('z-50');
  });
});
