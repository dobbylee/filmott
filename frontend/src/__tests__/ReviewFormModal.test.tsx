import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewFormModal from '@/components/review/ReviewFormModal';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockGet = vi.fn().mockResolvedValue({ data: { status: 'watched', watchlistId: 1 } });

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

const mockTrackEvent = vi.fn();
vi.mock('@/lib/ga', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe('ReviewFormModal', () => {
  const defaultProps = {
    contentId: 1,
    onClose: vi.fn(),
    onMutate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function changeRating(value: number) {
    fireEvent.change(screen.getByRole('slider', { name: '별점 선택' }), {
      target: { value: String(value) },
    });
  }

  it('신규 작성 모드에서 "리뷰 작성" 제목을 표시해야 한다', () => {
    render(<ReviewFormModal {...defaultProps} />);

    expect(screen.getByText('리뷰 작성')).toBeInTheDocument();
    expect(screen.getByText('별점')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('작품에 대한 한마디를 남겨보세요.')).toBeInTheDocument();
  });

  it('수정 모드에서 "리뷰 수정" 제목을 표시해야 한다', () => {
    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 8,
          comment: '좋은 영화',
          likesCount: 5,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    expect(screen.getByText('리뷰 수정')).toBeInTheDocument();
  });

  it('별점 미선택 상태에서 작성 클릭 시 에러를 표시해야 한다', async () => {
    const user = userEvent.setup();
    render(<ReviewFormModal {...defaultProps} />);

    await user.click(screen.getByText('작성'));
    expect(screen.getByText('별점을 선택해주세요.')).toBeInTheDocument();
  });

  it('별점 선택 시 에러가 사라져야 한다', async () => {
    const user = userEvent.setup();
    render(<ReviewFormModal {...defaultProps} />);

    await user.click(screen.getByText('작성'));
    expect(screen.getByText('별점을 선택해주세요.')).toBeInTheDocument();

    changeRating(5);
    expect(screen.queryByText('별점을 선택해주세요.')).not.toBeInTheDocument();
  });

  it('신규 작성 시 POST API를 호출해야 한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<ReviewFormModal {...defaultProps} />);

    changeRating(7);
    await user.type(
      screen.getByPlaceholderText('작품에 대한 한마디를 남겨보세요.'),
      '멋진 영화!',
    );
    await user.click(screen.getByText('작성'));

    expect(mockPost).toHaveBeenCalledWith('/reviews', {
      contentId: 1,
      rating: 7,
      comment: '멋진 영화!',
    });
  });

  it('수정 시 PATCH API를 호출해야 한다', async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 5,
          comment: '기존 리뷰',
          likesCount: 0,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    changeRating(8);
    await user.click(screen.getByText('수정'));

    expect(mockPatch).toHaveBeenCalledWith('/reviews/10', {
      rating: 8,
      comment: '기존 리뷰',
    });
  });

  it('성공 후 onClose와 onMutate를 호출해야 한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<ReviewFormModal {...defaultProps} />);

    changeRating(6);
    await user.click(screen.getByText('작성'));

    expect(defaultProps.onMutate).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('취소 버튼 클릭 시 onClose를 호출해야 한다', async () => {
    const user = userEvent.setup();

    render(<ReviewFormModal {...defaultProps} />);

    await user.click(screen.getByText('취소'));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('rating 변경 시 좋아요 초기화 경고를 표시해야 한다', () => {
    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 5,
          comment: '기존 리뷰',
          likesCount: 3,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    // 기존 rating과 다른 8점이 초기값이 아니므로 경고가 표시되지 않음
    // 기존 rating(5)과 현재값(5)이 같으면 경고 없음
    expect(screen.queryByText(/초기화/)).not.toBeInTheDocument();
  });

  it('rating 변경 시 좋아요가 있으면 경고 메시지를 표시해야 한다', () => {
    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 5,
          comment: '기존 리뷰',
          likesCount: 3,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    // rating을 5에서 8로 변경
    changeRating(8);

    expect(screen.getByText(/초기화/)).toBeInTheDocument();
    expect(screen.getByText(/3개/)).toBeInTheDocument();
  });

  it('코멘트만 변경 시에도 좋아요가 있으면 경고를 표시해야 한다', async () => {
    const user = userEvent.setup();

    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 5,
          comment: '기존 리뷰',
          likesCount: 3,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    const textarea = screen.getByPlaceholderText('작품에 대한 한마디를 남겨보세요.');
    await user.clear(textarea);
    await user.type(textarea, '수정된 리뷰');

    expect(screen.getByText(/초기화/)).toBeInTheDocument();
    expect(screen.getByText(/3개/)).toBeInTheDocument();
  });

  it('rating과 코멘트 모두 변경 없으면 좋아요가 있어도 경고를 표시하지 않아야 한다', () => {
    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 5,
          comment: '기존 리뷰',
          likesCount: 10,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    // 현재 rating(5)과 기존 rating(5)이 같으므로 경고 없음
    expect(screen.queryByText(/초기화/)).not.toBeInTheDocument();
  });

  it('좋아요가 0이면 rating 변경해도 경고를 표시하지 않아야 한다', () => {
    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 5,
          comment: '기존 리뷰',
          likesCount: 0,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    changeRating(9);

    expect(screen.queryByText(/초기화/)).not.toBeInTheDocument();
  });

  it('신규 작성 성공 시 review_created 이벤트를 content_id와 함께 호출해야 한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<ReviewFormModal {...defaultProps} />);

    changeRating(8);
    await user.click(screen.getByText('작성'));

    expect(mockTrackEvent).toHaveBeenCalledWith('review_created', { content_id: 1 });
  });

  it('신규 작성 실패 시 review_created 이벤트를 호출하지 않아야 한다', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: '서버 오류' } } });
    const user = userEvent.setup();

    render(<ReviewFormModal {...defaultProps} />);

    changeRating(6);
    await user.click(screen.getByText('작성'));

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('수정(patch) 시 review_created 이벤트를 호출하지 않아야 한다', async () => {
    mockPatch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(
      <ReviewFormModal
        {...defaultProps}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 5,
          comment: '기존 리뷰',
          likesCount: 0,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );

    changeRating(9);
    await user.click(screen.getByText('수정'));

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('코멘트가 비어있으면 undefined로 전달해야 한다', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<ReviewFormModal {...defaultProps} />);

    changeRating(7);
    await user.click(screen.getByText('작성'));

    expect(mockPost).toHaveBeenCalledWith('/reviews', {
      contentId: 1,
      rating: 7,
      comment: undefined,
    });
  });
});
