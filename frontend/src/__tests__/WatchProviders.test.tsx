import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WatchProviders from '@/components/content/WatchProviders';
import type { WatchProviderData } from '@/types/content';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, ...rest } = props;
    return <img {...rest} />;
  },
}));

describe('WatchProviders', () => {
  it('스트리밍 제공자를 렌더링한다', () => {
    const data: WatchProviderData = {
      flatrate: [
        { provider_id: 8, provider_name: '넷플릭스', logo_path: '/netflix.jpg' },
      ],
    };
    render(<WatchProviders data={data} />);
    expect(screen.getByText('스트리밍')).toBeInTheDocument();
    expect(screen.getByAltText('넷플릭스')).toBeInTheDocument();
  });

  it('대여 제공자를 렌더링한다', () => {
    const data: WatchProviderData = {
      rent: [
        { provider_id: 100, provider_name: '구글 플레이', logo_path: '/gplay.jpg' },
      ],
    };
    render(<WatchProviders data={data} />);
    expect(screen.getByText('대여')).toBeInTheDocument();
  });

  it('데이터가 null이면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(<WatchProviders data={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('제공자가 없으면 아무것도 렌더링하지 않는다', () => {
    const data: WatchProviderData = {};
    const { container } = render(<WatchProviders data={data} />);
    expect(container.innerHTML).toBe('');
  });
});
