/** How long trip generation waits before retrying a batch the AI could not answer. */
export const retryDelays = {
  smallerBatch: 1500,
  // Free AI tiers limit tokens per minute, so one patient wait lets that window pass.
  rateLimit: 65_000,
};
