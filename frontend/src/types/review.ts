import { ContentItem } from './content';

export interface ReviewUser {
  id: number;
  nickname: string;
  profileImage?: string | null;
  status?: string;
}

export interface Review {
  id: number;
  userId: number;
  contentId: number;
  rating?: number;
  comment?: string;
  watchedAt?: string | null;
  likesCount: number;
  commentsCount?: number;
  createdAt: string;
  updatedAt: string;
  user?: ReviewUser;
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
