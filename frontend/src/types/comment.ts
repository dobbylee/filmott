export interface Comment {
  id: number;
  userId: number;
  content: string;
  createdAt: string;
  user?: {
    id: number;
    nickname: string;
    profileImage?: string | null;
    status?: string;
  };
}

export interface CommentsResponse {
  data: Comment[];
  total: number;
  page: number;
  totalPages: number;
}
