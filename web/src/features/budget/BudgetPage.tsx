import { CATEGORIES, setOverride, tripBudget, type BudgetCategory } from '@tripwise/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMoney } from '../../lib/format';
import { useItineraryStore } from '../itinerary/itineraryStore';
import { useTripContext } from '../itinerary/tripContext';
import { BudgetMeter } from './BudgetMeter';

function AmountCell({
  estimate,
  override,
  currency,
  label,
  onChange,
}: {
  estimate: number;
  override: number | null;
  currency: string;
  label: string;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(override === null ? '' : String(override));
  const commit = () => {
    const trimmed = draft.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setDraft(override === null ? '' : String(override));
      return;
    }
    if (value !== override) onChange(value);
  };
  return (
    <td className="px-2 py-2 align-top">
      <label className="sr-only" htmlFor={label}>
        {label}
      </label>
      <input
        id={label}
        inputMode="decimal"
        value={draft}
        placeholder={formatMoney(estimate, currency)}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className={`w-24 rounded border px-2 py-1 text-end text-sm ${override === null ? 'border-slate-200 bg-white' : 'border-brand-600 bg-brand-50 font-semibold'}`}
      />
      <span className="mt-0.5 block text-end text-xs text-slate-500">
        {override === null ? t('budget.estimate') : t('budget.yours')}
      </span>
    </td>
  );
}

export function BudgetPage() {
  const { t } = useTranslation();
  const { trip } = useTripContext();
  const { days, overrides } = useItineraryStore((s) => s.history.present);
  const apply = useItineraryStore((s) => s.apply);
  const { currency, budgetAmount } = trip.request;
  const budget = tripBudget(days, overrides, budgetAmount ?? null);
  const update = (day: number, category: BudgetCategory, amount: number | null) => {
    apply((e) => ({ ...e, overrides: setOverride(e.overrides, day, category, amount) }));
  };

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4">
        <BudgetMeter budget={budget} currency={currency} />
        <dl className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          {CATEGORIES.map((category) => (
            <div key={category} className="flex justify-between py-1">
              <dt>{t(`budget.category.${category}`)}</dt>
              <dd className="font-semibold">
                {formatMoney(budget.byCategory[category], currency)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">{t('budget.disclaimer', { currency })}</p>
      </aside>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="px-4 pt-4 text-start text-base font-semibold">
            {t('budget.perDay')}
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th scope="col" className="px-4 py-2 text-start font-medium">
                {t('budget.day')}
              </th>
              {CATEGORIES.map((c) => (
                <th key={c} scope="col" className="px-2 py-2 text-end font-medium">
                  {t(`budget.category.${c}`)}
                </th>
              ))}
              <th scope="col" className="px-4 py-2 text-end font-medium">
                {t('budget.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {budget.days.map((day) => (
              <tr key={day.day} className="border-b border-slate-100">
                <th scope="row" className="px-4 py-2 text-start align-top font-medium">
                  {t('day.heading', { number: day.day + 1 })}
                </th>
                {day.categories.map((c) => (
                  <AmountCell
                    key={`${String(day.day)}-${c.category}-${String(c.override)}`}
                    estimate={c.estimate}
                    override={c.override}
                    currency={currency}
                    label={t('budget.cellLabel', {
                      category: t(`budget.category.${c.category}`),
                      number: day.day + 1,
                    })}
                    onChange={(value) => {
                      update(day.day, c.category, value);
                    }}
                  />
                ))}
                <td className="px-4 py-2 text-end align-top font-semibold">
                  {formatMoney(day.total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-slate-500">{t('budget.overrideHint')}</p>
      </div>
    </div>
  );
}
