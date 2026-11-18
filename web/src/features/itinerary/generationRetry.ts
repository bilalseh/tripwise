import { isApiError } from '../../lib/apiClient';

/**
 * Worth trying again: the AI was busy, a gateway timed out, or the connection dropped. A stale
 * version means an earlier try of the same days finished on the server after the browser gave up.
 */
export function isRetryable(error: unknown): boolean {
  if (!isApiError(error)) return true;
  if (error.status === 409) return error.code === 'stale_version';
  return [502, 503, 504].includes(error.status);
}

/** How long trip generation waits before retrying a batch the AI could not answer. */
export const retryDelays = {
  smallerBatch: 1500,
  // Free AI tiers limit tokens per minute, so one patient wait lets that window pass.
  rateLimit: 65_000,
};
