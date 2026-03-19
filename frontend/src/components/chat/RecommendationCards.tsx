'use client';

import RecommendationCard from './RecommendationCard';
import type { ChatRecommendationWithPoster } from '@/types/chat';

interface RecommendationCardsProps {
  recommendations: ChatRecommendationWithPoster[];
}

export default function RecommendationCards({ recommendations }: RecommendationCardsProps) {
  if (recommendations.length === 0) return null;

  return (
    <div className="mt-3 -mx-1">
      <div className="flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-thin scrollbar-thumb-white/10">
        {recommendations.map((rec) => (
          <RecommendationCard key={`${rec.contentType}-${rec.tmdbId}`} recommendation={rec} />
        ))}
      </div>
    </div>
  );
}
