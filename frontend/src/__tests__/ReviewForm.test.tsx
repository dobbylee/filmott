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
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
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
    expect(screen.getByText(/한줄평을 남기려면/)).toBeInTheDocument();
  });

  it('로그인 시 작성 폼을 표시한다', () => {
    mockUser = { id: 1, nickname: '테스트' };
    render(<ReviewForm contentId={1} />);
    expect(screen.getByText('한줄평 작성')).toBeInTheDocument();
    expect(screen.getByText('별점')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('작품에 대한 한마디를 남겨보세요.')).toBeInTheDocument();
  });

  it('별점 미선택 시 등록 버튼이 비활성화된다', () => {
    mockUser = { id: 1, nickname: '테스트' };
    render(<ReviewForm contentId={1} />);
    expect(screen.getByText('등록')).toBeDisabled();
  });

  it('별점 선택 후 등록 버튼이 활성화된다', async () => {
    mockUser = { id: 1, nickname: '테스트' };
    const user = userEvent.setup();
    render(<ReviewForm contentId={1} />);

    await user.click(screen.getByLabelText('7점'));
    expect(screen.getByText('등록')).not.toBeDisabled();
  });

  it('기존 리뷰가 있으면 내 한줄평 모드로 표시한다', () => {
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
          hasSpoiler: false,
          likesCount: 3,
          createdAt: '2024-12-25T12:00:00Z',
          updatedAt: '2024-12-25T12:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('내 한줄평')).toBeInTheDocument();
    expect(screen.getByText('기존 리뷰')).toBeInTheDocument();
    expect(screen.getByText('수정')).toBeInTheDocument();
    expect(screen.getByText('삭제')).toBeInTheDocument();
  });

  it('스포일러 토글이 동작한다', async () => {
    mockUser = { id: 1, nickname: '테스트' };
    const user = userEvent.setup();
    render(<ReviewForm contentId={1} />);

    const checkbox = screen.getByLabelText('스포일러 포함');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
