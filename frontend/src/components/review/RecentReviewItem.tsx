import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import TimeAgo from '@/components/common/TimeAgo';
import type { Review } from '@/types/review';
import type { ContentItem } from '@/types/content';
import { TMDB_IMAGE_BASE } from '@/types/content';
import { getDisplayNickname, isDeletedUser } from '@/utils/user';

export default function RecentReviewItem({ review }: { review: Review }) {
  const content = review.content as ContentItem | undefined;
  const href = content ? `/contents/${content.contentType}/${content.tmdbId}` : '#';

  return (
    <div className="group relative flex gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 hover:bg-white/10 transition-colors backdrop-blur-sm">
      {content?.posterUrl && (
        <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
          <Link href={href} className="relative h-[100px] w-[66px] overflow-hidden rounded-lg shadow-lg">
            <Image
              src={content.posterUrl.startsWith('http') ? content.posterUrl : `${TMDB_IMAGE_BASE}/w154${content.posterUrl}`}
              alt={content.title}
              fill
              sizes="66px"
              className="object-cover group-hover:scale-110 transition-transform duration-500"
            />
          </Link>
          {content && (
            <Link href={href} className="w-[80px] text-center">
              <p className="text-sm font-medium text-white/90 truncate hover:text-fuchsia-400 transition-colors">
                {content.title}
              </p>
            </Link>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 유저 + 별점 + 시간 */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm ${isDeletedUser(review.user) ? 'bg-muted text-muted-foreground' : 'bg-gradient-to-tr from-fuchsia-700 to-indigo-600 text-white'}`}>
              {isDeletedUser(review.user) ? '?' : (review.user?.nickname?.charAt(0) ?? '?')}
            </div>
            <span className={`text-sm font-medium ${isDeletedUser(review.user) ? 'text-muted-foreground' : 'text-white/90'}`}>
              {getDisplayNickname(review.user)}
            </span>
            {review.rating != null && (
              <div className="flex items-center gap-0.5">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-xs font-semibold">{review.rating}</span>
              </div>
            )}
          </div>
          <TimeAgo date={review.createdAt} className="text-xs text-white/40 flex-shrink-0 ml-2" />
        </div>

        {/* 코멘트 */}
        {review.comment && (
          <p className="mt-4 px-3 text-sm leading-relaxed text-white/70 line-clamp-2">
            {review.comment}
          </p>
        )}
      </div>
    </div>
  );
}
