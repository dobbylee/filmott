import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewFormModal from '@/components/review/ReviewFormModal';
import { apiUrl } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';

const mockRefresh = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

function changeRating(value: number): void {
  fireEvent.change(screen.getByRole('slider', { name: '별점 선택' }), {
    target: { value: String(value) },
  });
}

function getDateInput(): HTMLInputElement {
  const field = screen.getByText('감상 날짜').parentElement?.querySelector('input');
  if (!(field instanceof HTMLInputElement)) {
    throw new Error('감상 날짜 입력 필드를 찾을 수 없습니다.');
  }
  return field;
}

describe('Review flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('리뷰 작성 시 API payload가 맞고 성공 후 갱신 콜백을 호출해야 한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onMutate = vi.fn();
    let reviewPayload: unknown = null;

    server.use(
      http.get(apiUrl('/watchlist/me/status'), ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('contentId')).toBe('10');
        return HttpResponse.json({
          status: 'watched',
          watchlistId: 55,
          watchedAt: '2026-04-30',
        });
      }),
      http.post(apiUrl('/reviews'), async ({ request }) => {
        reviewPayload = (await request.json()) as unknown;
        return HttpResponse.json({ id: 77 }, { status: 201 });
      }),
    );

    render(
      <ReviewFormModal contentId={10} onClose={onClose} onMutate={onMutate} />,
    );

    await waitFor(() => {
      expect(getDateInput()).toHaveValue('2026-04-30');
    });
    changeRating(8);
    await user.type(
      screen.getByPlaceholderText('작품에 대한 한마디를 남겨보세요.'),
      'MSW로 저장한 리뷰',
    );
    await user.click(screen.getByRole('button', { name: '작성' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(reviewPayload).toEqual({
      contentId: 10,
      rating: 8,
      comment: 'MSW로 저장한 리뷰',
      watchedAt: '2026-04-30',
    });
    expect(onMutate).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith('review_created', {
      content_id: 10,
    });
  });

  it('리뷰 작성 실패 시 서버 메시지를 표시하고 성공 이벤트를 보내지 않아야 한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    server.use(
      http.get(apiUrl('/watchlist/me/status'), () => {
        return HttpResponse.json({ status: null, watchlistId: null });
      }),
      http.post(apiUrl('/reviews'), () => {
        return HttpResponse.json(
          { message: '이미 리뷰를 작성했습니다.' },
          { status: 409 },
        );
      }),
    );

    render(<ReviewFormModal contentId={10} onClose={onClose} />);

    changeRating(7);
    await user.click(screen.getByRole('button', { name: '작성' }));

    expect(
      await screen.findByText('이미 리뷰를 작성했습니다.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});
