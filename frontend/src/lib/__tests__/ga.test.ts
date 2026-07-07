import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/ga';

describe('trackEvent', () => {
  beforeEach(() => {
    delete window.gtag;
    delete window.dataLayer;
  });

  it('gtag가 있으면 GA 이벤트를 즉시 전송해야 한다', () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    trackEvent('review_created', { content_id: 1 });

    expect(gtag).toHaveBeenCalledWith('event', 'review_created', {
      content_id: 1,
    });
    expect(window.dataLayer).toBeUndefined();
  });

  it('gtag가 아직 없으면 dataLayer에 이벤트를 큐잉해야 한다', () => {
    trackEvent('review_created', { content_id: 1 });

    expect(window.dataLayer).toEqual([
      ['event', 'review_created', { content_id: 1 }],
    ]);
  });

  it('기존 dataLayer가 있으면 보존하면서 이벤트를 추가해야 한다', () => {
    const queuedConfig = ['config', 'G-TESTID123'];
    window.dataLayer = [queuedConfig];

    trackEvent('watchlist_added', {
      status: 'watched',
      content_type: 'movie',
    });

    expect(window.dataLayer).toEqual([
      queuedConfig,
      [
        'event',
        'watchlist_added',
        { status: 'watched', content_type: 'movie' },
      ],
    ]);
  });
});
