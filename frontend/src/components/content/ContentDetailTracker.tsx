'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/ga';

interface ContentDetailTrackerProps {
  tmdbId: string;
  title: string;
  contentType: string;
}

export default function ContentDetailTracker({ tmdbId, title, contentType }: ContentDetailTrackerProps) {
  useEffect(() => {
    trackEvent('content_detail_view', {
      tmdb_id: tmdbId,
      title,
      content_type: contentType,
    });
  }, [tmdbId, title, contentType]);

  return null;
}
