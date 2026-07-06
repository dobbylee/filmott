import * as Sentry from '@sentry/nextjs';
import { isAxiosError } from 'axios';

type AuthFailureFlow =
  | 'admin_login'
  | 'social_auth_callback'
  | 'social_session_restore'
  | 'social_signup_complete';

interface AuthFailureContext {
  flow: AuthFailureFlow;
  reason?: string;
}

function getAxiosErrorContext(error: unknown) {
  if (!isAxiosError(error)) {
    return {};
  }

  return {
    status: error.response?.status,
    code: error.code,
    method: error.config?.method?.toUpperCase(),
    url: error.config?.url,
  };
}

function getTags(context: AuthFailureContext): Record<string, string> {
  return {
    feature: 'auth',
    auth_flow: context.flow,
    ...(context.reason ? { auth_error_reason: context.reason } : {}),
  };
}

function getContext(error: unknown, context: AuthFailureContext) {
  return {
    flow: context.flow,
    ...(context.reason ? { reason: context.reason } : {}),
    ...getAxiosErrorContext(error),
  };
}

function createSanitizedError(error: unknown, flow: AuthFailureFlow): Error {
  if (!isAxiosError(error) && error instanceof Error) {
    return error;
  }

  const axiosContext = getAxiosErrorContext(error);
  const statusText =
    'status' in axiosContext && typeof axiosContext.status === 'number'
      ? ` (${axiosContext.status})`
      : '';

  return new Error(`Auth failure: ${flow}${statusText}`);
}

export function captureAuthFailure(
  error: unknown,
  context: AuthFailureContext,
) {
  Sentry.captureException(createSanitizedError(error, context.flow), {
    level: 'error',
    tags: getTags(context),
    contexts: {
      auth: getContext(error, context),
    },
  });
}

export function captureAuthFailureMessage(
  message: string,
  context: AuthFailureContext,
) {
  Sentry.captureMessage(message, {
    level: 'error',
    tags: getTags(context),
    contexts: {
      auth: getContext(undefined, context),
    },
  });
}
