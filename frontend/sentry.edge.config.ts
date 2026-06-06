import * as Sentry from '@sentry/nextjs';
import { filterSentryEvent } from './src/lib/sentry-filter';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  beforeSend: filterSentryEvent,
});
