'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

let initialized = false;

export default function SentryInit() {
  useEffect(() => {
    if (initialized) return;
    initialized = true;

    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      integrations: [Sentry.replayIntegration()],
    });
  }, []);

  return null;
}
