import axios from 'axios';

/**
 * Type-safe error message extraction from Axios errors.
 * Use this instead of `catch (err: any)` throughout the app.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message || fallback;
  }
  return fallback;
}
