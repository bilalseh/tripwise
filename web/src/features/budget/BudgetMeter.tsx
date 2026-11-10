import type { TripBudget } from '@tripwise/shared';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '../../lib/format';

const BAR = {
  under: 'bg-emerald-600',
  near: 'bg-amber-500',
  over: 'bg-red-600',
  unset: 'bg-brand-600',
} as const;

/** Estimated total against the budget from the wizard. */
export function BudgetMeter({ budget, currency }: { budget: TripBudget; currency: string }) {
  const { t } = useTranslation();
  const percent = budget.ratio === null ? 0 : Math.round(budget.ratio * 100);
  return (
    <section
      aria-labelledby="meter-title"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <h2 id="meter-title" className="text-sm font-medium text-slate-600">
        {t('budget.estimatedTotal')}
      </h2>
      <p className="mt-1 text-3xl font-bold">{formatMoney(budget.total, currency)}</p>
      {budget.limit === null ? (
        <p className="mt-2 text-sm text-slate-600">{t('budget.noLimit')}</p>
      ) : (
        <>
          <div
            role="meter"
            aria-label={t('budget.meterLabel')}
            aria-valuemin={0}
            aria-valuemax={budget.limit}
            aria-valuenow={Math.min(budget.total, budget.limit)}
            aria-valuetext={t('budget.meterText', {
              percent,
              limit: formatMoney(budget.limit, currency),
            })}
            className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className={`h-full ${BAR[budget.status]}`}
              style={{ width: `${String(Math.min(100, percent))}%` }}
            />
          </div>
          <p
            className={`mt-2 text-sm ${budget.status === 'over' ? 'font-semibold text-red-700' : 'text-slate-600'}`}
          >
            {t(`budget.status.${budget.status}`, {
              percent,
              limit: formatMoney(budget.limit, currency),
              diff: formatMoney(Math.abs(budget.limit - budget.total), currency),
            })}
          </p>
        </>
      )}
    </section>
  );
}
