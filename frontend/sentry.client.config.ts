import * as Sentry from '@sentry/nextjs';
import { filterSentryEvent } from './src/lib/sentry-filter';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.01,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.2,
  integrations: [Sentry.replayIntegration()],
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  beforeSend: filterSentryEvent,
});
