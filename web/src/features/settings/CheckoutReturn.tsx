import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { keys } from '../../lib/queries';
import { confirmCheckout } from '../billing/billingApi';

/** Back from Stripe: the API checks the session with Stripe before upgrading anyone. */
export function CheckoutReturn({ uid, sessionId }: { uid: string; sessionId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useQuery({
    queryKey: ['checkout', sessionId],
    queryFn: () => confirmCheckout(sessionId),
    retry: 2,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!confirm.data) return;
    queryClient.setQueryData(keys.profile(uid), confirm.data);
    void queryClient.invalidateQueries({ queryKey: keys.usage(uid) });
    void queryClient.invalidateQueries({ queryKey: keys.billing(uid) });
  }, [confirm.data, queryClient, uid]);

  if (confirm.isPending)
    return (
      <p role="status" className="rounded-lg bg-slate-100 px-4 py-3">
        {t('settings.checkoutConfirming')}
      </p>
    );
  if (confirm.isError)
    return (
      <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
        {t('settings.checkoutFailed')}
      </p>
    );
  return (
    <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 font-semibold text-brand-900">
      {t('settings.checkoutSuccess')}
    </p>
  );
}
