import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { keys, usageQuery } from '../../lib/queries';
import { cancelPro } from '../billing/billingApi';

export function PlanSection({ uid }: { uid: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const usage = useQuery(usageQuery(uid));
  const cancel = useMutation({
    mutationFn: cancelPro,
    onSuccess: (profile) => {
      queryClient.setQueryData(keys.profile(uid), profile);
      void queryClient.invalidateQueries({ queryKey: keys.usage(uid) });
    },
  });
  const data = usage.data;

  return (
    <section
      aria-labelledby="plan-title"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2 id="plan-title" className="text-lg font-semibold">
        {t('settings.plan')}
      </h2>
      {data && (
        <>
          <p className="mt-2">{t('settings.planName', { plan: t(`pricing.${data.tier}.name`) })}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>{t('settings.aiUsage', { used: data.aiUsed, limit: data.aiLimit })}</li>
            <li>
              {data.tripLimit === null
                ? t('settings.tripsUnlimited', { count: data.trips })
                : t('settings.tripUsage', { count: data.trips, limit: data.tripLimit })}
            </li>
          </ul>
          <div className="mt-4">
            {data.tier === 'free' ? (
              <Link to="/pricing" className={buttonClass()}>
                {t('settings.upgrade')}
              </Link>
            ) : (
              <Button
                variant="secondary"
                disabled={cancel.isPending}
                onClick={() => {
                  cancel.mutate();
                }}
              >
                {t('settings.cancelPro')}
              </Button>
            )}
          </div>
          {cancel.isError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {t('pricing.failed')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
