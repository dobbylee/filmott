import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ContentDetailTracker from '@/components/content/ContentDetailTracker';

const mockTrackEvent = vi.fn();
vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe('ContentDetailTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('마운트 시 content_detail_view 이벤트를 호출해야 한다', () => {
    render(
      <ContentDetailTracker tmdbId="123" title="테스트 영화" contentType="movie" />,
    );

    expect(mockTrackEvent).toHaveBeenCalledWith('content_detail_view', {
      tmdb_id: '123',
      title: '테스트 영화',
      content_type: 'movie',
    });
  });

  it('아무것도 렌더링하지 않아야 한다 (null 반환)', () => {
    const { container } = render(
      <ContentDetailTracker tmdbId="1" title="제목" contentType="movie" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('tmdbId가 변경되면 이벤트를 다시 호출해야 한다', () => {
    const { rerender } = render(
      <ContentDetailTracker tmdbId="100" title="영화A" contentType="movie" />,
    );

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);

    rerender(
      <ContentDetailTracker tmdbId="200" title="영화B" contentType="movie" />,
    );

    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackEvent).toHaveBeenLastCalledWith('content_detail_view', {
      tmdb_id: '200',
      title: '영화B',
      content_type: 'movie',
    });
  });

  it('동일한 props로 재렌더링될 때 이벤트를 중복 호출하지 않아야 한다', () => {
    const { rerender } = render(
      <ContentDetailTracker tmdbId="100" title="영화A" contentType="movie" />,
    );

    rerender(
      <ContentDetailTracker tmdbId="100" title="영화A" contentType="movie" />,
    );

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });
});
