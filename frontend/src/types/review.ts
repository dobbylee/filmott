import { User } from './auth';
import { ContentItem } from './content';

export interface Review {
  id: number;
  userId: number;
  contentId: number;
  rating?: number;
  comment?: string;
  likesCount: number;
  commentsCount?: number;
  createdAt: string;
  updatedAt: string;
  user?: User;
  content?: ContentItem;
}

export interface ReviewsResponse {
  data: Review[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ContentStats {
  averageRating: number | null;
  reviewCount: number;
}
