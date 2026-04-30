export interface ChatMessageData {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  recommendations: ChatRecommendationWithPoster[] | null;
  createdAt: string;
}

export interface ChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
}

export interface ChatRecommendationWithPoster extends ChatRecommendation {
  posterUrl: string | null;
}
