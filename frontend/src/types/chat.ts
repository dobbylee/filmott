export interface ChatMessageData {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  structuredContent?: ChatStructuredContent;
  recommendations: ChatRecommendationWithPoster[] | null;
  createdAt: string;
}

export interface ChatStructuredItem {
  title: string;
  description: string;
}

export interface ChatStructuredContent {
  intro: string;
  items: ChatStructuredItem[];
  outro: string;
}

export interface ChatRecommendation {
  tmdbId: number;
  contentType: 'movie' | 'tv';
  title: string;
}

export interface ChatRecommendationWithPoster extends ChatRecommendation {
  posterUrl: string | null;
}
