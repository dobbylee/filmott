export interface Comment {
  id: number;
  userId: number;
  content: string;
  createdAt: string;
  user?: {
    id: number;
    nickname: string;
    status?: string;
  };
}

export interface CommentsResponse {
  data: Comment[];
  total: number;
  page: number;
  totalPages: number;
}
