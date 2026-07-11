import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WatchProviders from '@/components/content/WatchProviders';
import type { WatchProviderData } from '@/types/content';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, unoptimized, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...rest} alt={typeof rest.alt === 'string' ? rest.alt : ''} data-fill={fill ? 'true' : undefined} data-unoptimized={unoptimized ? 'true' : undefined} />;
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

  it('로고 이미지에 w92 사이즈를 사용한다', () => {
    const data: WatchProviderData = {
      flatrate: [
        { provider_id: 8, provider_name: '넷플릭스', logo_path: '/netflix.jpg' },
      ],
    };
    render(<WatchProviders data={data} />);
    const img = screen.getByAltText('넷플릭스');
    expect(img).toHaveAttribute('src', expect.stringContaining('/w92/'));
    expect(img).not.toHaveAttribute('src', expect.stringContaining('/original/'));
  });

  it('compact 모드에서 구독과 대여·구매 로고를 구분해야 한다', () => {
    const data: WatchProviderData = {
      flatrate: [
        { provider_id: 8, provider_name: '넷플릭스', logo_path: '/netflix.jpg' },
      ],
      rent: [
        { provider_id: 100, provider_name: '구글 플레이', logo_path: '/gplay.jpg' },
      ],
      buy: [
        { provider_id: 101, provider_name: '애플 TV', logo_path: '/apple.jpg' },
      ],
    };

    render(<WatchProviders data={data} compact />);

    expect(screen.getByText('구독')).toHaveClass('text-right');
    expect(screen.getByText('대여·구매')).toHaveClass('text-right');
    expect(screen.getByAltText('넷플릭스')).toBeInTheDocument();
    expect(screen.getByAltText('구글 플레이')).toBeInTheDocument();
    expect(screen.getByAltText('애플 TV')).toBeInTheDocument();
  });

  it('compact 대여·구매 그룹에서 같은 제공자와 광고 요금제를 중복 표시하지 않아야 한다', () => {
    const googlePlay = {
      provider_id: 100,
      provider_name: '구글 플레이',
      logo_path: '/gplay.jpg',
    };
    const data: WatchProviderData = {
      rent: [googlePlay],
      buy: [
        googlePlay,
        {
          provider_id: 1796,
          provider_name: 'Netflix Standard with Ads',
          logo_path: '/netflix-ads.jpg',
        },
      ],
    };

    render(<WatchProviders data={data} compact />);

    expect(screen.queryByText('구독')).not.toBeInTheDocument();
    expect(screen.getAllByAltText('구글 플레이')).toHaveLength(1);
    expect(
      screen.queryByAltText('Netflix Standard with Ads'),
    ).not.toBeInTheDocument();
  });
});
