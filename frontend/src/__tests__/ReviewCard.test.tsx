import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReviewCard from '@/components/review/ReviewCard';
import type { Review } from '@/types/review';

describe('ReviewCard', () => {
  const review: Review = {
    id: 1,
    userId: 10,
    contentId: 100,
    rating: 8,
    comment: '정말 좋은 영화입니다!',
    hasSpoiler: false,
    likesCount: 5,
    createdAt: '2024-12-25T12:00:00Z',
    updatedAt: '2024-12-25T12:00:00Z',
    user: {
      id: 10,
      nickname: '영화팬',
      email: 'fan@test.com',
    },
  };

  it('닉네임과 코멘트를 렌더링한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('영화팬')).toBeInTheDocument();
    expect(screen.getByText('정말 좋은 영화입니다!')).toBeInTheDocument();
  });

  it('평점을 표시한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('좋아요 수를 표시한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('스포일러 리뷰를 접어서 표시한다', () => {
    const spoilerReview = { ...review, hasSpoiler: true };
    render(<ReviewCard review={spoilerReview} />);
    expect(screen.getByText(/스포일러 포함/)).toBeInTheDocument();
  });

  it('닉네임 첫 글자를 아바타로 표시한다', () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByText('영')).toBeInTheDocument();
  });
});
