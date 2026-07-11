import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WatchlistStatusButton from '@/components/watchlist/WatchlistStatusButton';
import { createMockAuth } from '@/__tests__/helpers/mockAuthContext';
import { apiUrl } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';

const mockRefresh = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => createMockAuth({ user: { id: 1, nickname: 'testuser' } }),
}));

vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe('WatchlistStatusButton integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('보고 싶어요를 직접 누르면 watchlist API에 저장하고 상태 버튼으로 전환해야 한다', async () => {
    const user = userEvent.setup();
    let status: 'want_to_watch' | null = null;
    let requestPayload: unknown = null;

    server.use(
      http.get(apiUrl('/watchlist/me/status'), () => {
        return HttpResponse.json({
          status,
          watchlistId: status ? 55 : null,
          watchedAt: null,
        });
      }),
      http.post(apiUrl('/watchlist'), async ({ request }) => {
        requestPayload = (await request.json()) as unknown;
        status = 'want_to_watch';
        return HttpResponse.json({ id: 55, status, watchedAt: null }, { status: 201 });
      }),
    );

    render(
      <WatchlistStatusButton contentId={10} tmdbId={496243} contentType="movie" />,
    );

    await user.click(
      await screen.findByRole('button', { name: '보고 싶어요' }),
    );

    await waitFor(() => {
      expect(requestPayload).toEqual({
        tmdbId: 496243,
        contentType: 'movie',
        status: 'want_to_watch',
      });
    });
    expect(
      await screen.findByRole('button', { name: '감상할 작품' }),
    ).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith('watchlist_added', {
      status: 'want_to_watch',
      content_type: 'movie',
    });
    expect(mockRefresh).toHaveBeenCalled();
  });
});
