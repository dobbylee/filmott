import { Star, AlertTriangle } from 'lucide-react';
import LikeButton from './LikeButton';
import ReviewComments from './ReviewComments';
import type { Review } from '@/types/review';

interface ReviewCardProps {
  review: Review;
  showInteractions?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ReviewCard({ review, showInteractions = true }: ReviewCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
            {review.user?.nickname?.charAt(0) ?? '?'}
          </div>
          <div>
            <p className="text-sm font-medium">
              {review.user?.nickname ?? '익명'}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(review.createdAt)}
            </p>
          </div>
        </div>

        {review.rating != null && (
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-semibold">{review.rating}</span>
          </div>
        )}
      </div>

      {review.comment && (
        <div className="mt-3">
          {review.hasSpoiler ? (
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-1 text-sm text-orange-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                스포일러 포함 (클릭하여 보기)
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                {review.comment}
              </p>
            </details>
          ) : (
            <p className="text-sm leading-relaxed text-card-foreground">
              {review.comment}
            </p>
          )}
        </div>
      )}

      {showInteractions ? (
        <div className="mt-3 flex items-center gap-4">
          <LikeButton
            reviewId={review.id}
            initialCount={review.likesCount}
          />
          <ReviewComments reviewId={review.id} />
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{review.likesCount} 좋아요</span>
        </div>
      )}
    </div>
  );
}
