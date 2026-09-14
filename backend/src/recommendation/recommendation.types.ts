export interface SimilarContent {
  contentId: number;
  tmdbId: number;
  contentType: string;
  title: string;
  posterUrl: string | null;
  genres: { id: number; name: string }[];
  voteAverage: number;
  description: string;
  similarity: number;
  director: string | null;
  originCountry: string | null;
  overview: string | null;
}

export interface BatchResult {
  cached: number;
  skipped: number;
  failed: number;
}
