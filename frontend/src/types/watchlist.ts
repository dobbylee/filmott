import { ContentItem } from './content';
import { Review } from './review';

export type WatchlistStatus = 'want_to_watch' | 'watched';

export interface WatchlistItem {
  id: number;
  userId: number;
  contentId: number;
  status: WatchlistStatus;
  watchedAt: string | null;
  createdAt: string;
  updatedAt: string;
  content: ContentItem;
  review?: Review;
}

export interface WatchlistCounts {
  watchedCount: number;
  wantToWatchCount: number;
}

export interface WatchlistStatusResponse {
  status: WatchlistStatus | null;
  watchlistId: number | null;
}

export interface WatchlistPage {
  items: WatchlistItem[];
  total: number;
  page: number;
  totalPages: number;
}
