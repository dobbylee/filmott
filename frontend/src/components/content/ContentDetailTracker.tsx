'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/ga';

interface ContentDetailTrackerProps {
  tmdbId: string;
  contentType: string;
}

export default function ContentDetailTracker({ tmdbId, contentType }: ContentDetailTrackerProps) {
  useEffect(() => {
    trackEvent('content_detail_view', {
      tmdb_id: tmdbId,
      content_type: contentType,
    });
  }, [tmdbId, contentType]);

  return null;
}
