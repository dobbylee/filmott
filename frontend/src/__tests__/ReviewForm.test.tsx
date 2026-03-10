import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewForm from '@/components/review/ReviewForm';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

let mockUser: { id: number; nickname: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    token: null,
    isLoading: false,
    updateUser: vi.fn(),
    openAuthModal: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: { data: [], total: 0, page: 1, totalPages: 0 } }),
  },
}));

describe('ReviewForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('미로그인 시 로그인 유도 메시지를 표시한다', () => {
    render(<ReviewForm contentId={1} />);
    expect(screen.getByText(/로그인/)).toBeInTheDocument();
    expect(screen.getByText(/리뷰를 남기려면/)).toBeInTheDocument();
  });

  it('로그인 시 리뷰 작성 버튼을 표시한다', () => {
    mockUser = { id: 1, nickname: '테스트' };
    render(<ReviewForm contentId={1} />);
    expect(screen.getByText('리뷰 작성')).toBeInTheDocument();
  });

  it('작성 버튼 클릭 시 모달을 표시한다', async () => {
    mockUser = { id: 1, nickname: '테스트' };
    const user = userEvent.setup();
    render(<ReviewForm contentId={1} />);

    await user.click(screen.getByText('리뷰 작성'));
    expect(screen.getByText('별점')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('작품에 대한 한마디를 남겨보세요.')).toBeInTheDocument();
    expect(screen.getByText('등록')).toBeDisabled();
  });

  it('기존 리뷰가 있으면 내 리뷰 모드로 표시한다', () => {
    mockUser = { id: 1, nickname: '테스트' };
    render(
      <ReviewForm
        contentId={1}
        existingReview={{
          id: 10,
          userId: 1,
          contentId: 1,
          rating: 8,
          comment: '기존 리뷰',
          likesCount: 3,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('내 리뷰')).toBeInTheDocument();
    expect(screen.getByText('기존 리뷰')).toBeInTheDocument();
    expect(screen.getByText('수정')).toBeInTheDocument();
    expect(screen.getByText('삭제')).toBeInTheDocument();
  });
});
