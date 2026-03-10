import ReviewCard from './ReviewCard';
import type { Review } from '@/types/review';

interface ReviewListProps {
  reviews: Review[];
  emptyMessage?: string;
}

export default function ReviewList({
  reviews,
  emptyMessage = '아직 리뷰가 없습니다.',
}: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div className="flex min-h-[100px] items-center justify-center text-sm text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}
