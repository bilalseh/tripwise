import type { CheckoutSession, Profile } from '@tripwise/shared';

import { api } from '../../lib/apiClient';

/** Sends the browser to Stripe's hosted TEST MODE checkout, after checking where it goes. */
export async function startCheckout(): Promise<void> {
  const session = await api.post<CheckoutSession>('/billing/checkout');
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('stripe.com')) {
    throw new Error('Unexpected checkout address');
  }
  window.location.assign(url.href);
}

export const confirmCheckout = (sessionId: string) =>
  api.post<Profile>('/billing/confirm', { sessionId });
export const cancelPro = () => api.post<Profile>('/billing/cancel');
