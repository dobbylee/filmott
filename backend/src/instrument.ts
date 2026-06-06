import * as Sentry from '@sentry/nestjs';
import { filterSentryEvent } from './common/sentry-filter';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.01,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  release: process.env.SENTRY_RELEASE,
  beforeSend: filterSentryEvent,
});
