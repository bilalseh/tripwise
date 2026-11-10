import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { formatMoney } from '../../lib/format';
import { billingQuery, profileQuery } from '../../lib/queries';
import { useAuthUser } from '../auth/useAuthUser';
import { startCheckout } from './billingApi';

const FREE = ['free.trips', 'free.ai', 'free.features'] as const;
const PRO = ['pro.trips', 'pro.ai', 'pro.features'] as const;

export function PricingPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const [params] = useSearchParams();
  const profile = useQuery({ ...profileQuery(user?.uid ?? ''), enabled: Boolean(user) });
  const billing = useQuery({ ...billingQuery(user?.uid ?? ''), enabled: Boolean(user) });
  const checkout = useMutation({ mutationFn: startCheckout });
  const isPro = profile.data?.tier === 'pro';
  const price = formatMoney((billing.data?.priceCents ?? 500) / 100, 'USD');

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p
        role="note"
        className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        <strong>{t('pricing.testMode')}</strong> {t('pricing.testModeBody')}
      </p>
      <h1 className="text-center text-3xl font-bold tracking-tight">{t('pricing.title')}</h1>
      <p className="mt-2 text-center text-slate-600">{t('pricing.subtitle')}</p>
      {params.get('checkout') === 'cancelled' && (
        <p role="status" className="mt-4 text-center text-sm text-slate-600">
          {t('pricing.cancelled')}
        </p>
      )}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="free-plan"
          className="rounded-2xl border border-slate-200 bg-white p-6"
        >
          <h2 id="free-plan" className="text-xl font-semibold">
            {t('pricing.free.name')}
          </h2>
          <p className="mt-2 text-3xl font-bold">{formatMoney(0, 'USD')}</p>
          <ul className="mt-4 space-y-2 text-slate-700">
            {FREE.map((k) => (
              <li key={k}>✓ {t(`pricing.${k}`)}</li>
            ))}
          </ul>
          {!user && (
            <Link to="/sign-in" className={`${buttonClass('secondary')} mt-6 w-full`}>
              {t('pricing.start')}
            </Link>
          )}
        </section>
        <section
          aria-labelledby="pro-plan"
          className="rounded-2xl border-2 border-brand-600 bg-white p-6"
        >
          <h2 id="pro-plan" className="text-xl font-semibold">
            {t('pricing.pro.name')}
          </h2>
          <p className="mt-2 text-3xl font-bold">
            {price}{' '}
            <span className="text-base font-normal text-slate-600">{t('pricing.perMonth')}</span>
          </p>
          <ul className="mt-4 space-y-2 text-slate-700">
            {PRO.map((k) => (
              <li key={k}>✓ {t(`pricing.${k}`)}</li>
            ))}
          </ul>
          {!user ? (
            <Link to="/sign-in?next=%2Fpricing" className={`${buttonClass()} mt-6 w-full`}>
              {t('pricing.signInToUpgrade')}
            </Link>
          ) : isPro ? (
            <p className="mt-6 rounded-lg bg-brand-50 px-4 py-2 text-center font-semibold text-brand-900">
              {t('pricing.current')}
            </p>
          ) : (
            <Button
              className="mt-6 w-full"
              disabled={checkout.isPending || billing.data?.available === false}
              onClick={() => {
                checkout.mutate();
              }}
            >
              {checkout.isPending ? t('pricing.redirecting') : t('pricing.upgrade')}
            </Button>
          )}
          {billing.data?.available === false && (
            <p className="mt-2 text-sm text-slate-600">{t('pricing.unavailable')}</p>
          )}
          {checkout.isError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {t('pricing.failed')}
            </p>
          )}
        </section>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">{t('pricing.noTravelPayments')}</p>
    </div>
  );
}
