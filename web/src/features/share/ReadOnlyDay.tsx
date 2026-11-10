import { formatClock, scheduleDay, type Day } from '@tripwise/shared';
import { useTranslation } from 'react-i18next';

import { addDays, formatDate, formatMinutes, formatMoney } from '../../lib/format';
import { dayColor } from '../map/dayColors';
import { useDayLegs } from '../itinerary/useDayLegs';

/** A day as a plain list (share page and PDF). Travel times are local estimates only. */
export function ReadOnlyDay({
  day,
  dayIndex,
  startDate,
  currency,
  compact = false,
}: {
  day: Day;
  dayIndex: number;
  startDate: string | null;
  currency: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const legs = useDayLegs(day.stops, false);
  const schedule = scheduleDay(day.stops, legs);
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} break-inside-avoid`}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span
          aria-hidden="true"
          className="size-3 rounded-full print:hidden"
          style={{ background: dayColor(dayIndex) }}
        />
        {t('day.heading', { number: dayIndex + 1 })}
        {startDate && (
          <span className="text-sm font-normal text-slate-600">
            {formatDate(addDays(startDate, dayIndex))}
          </span>
        )}
      </h2>
      {day.title && <p className="text-sm text-slate-700">{day.title}</p>}
      <ol className="mt-3 space-y-3">
        {schedule.map((item, index) => (
          <li key={item.stop.id} className="flex gap-3">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white print:border print:border-slate-400 print:text-slate-900"
              style={{ background: dayColor(dayIndex) }}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">
                {item.stop.place.name}
                <span className="ms-2 text-sm font-normal text-slate-600">
                  {t('stop.time', { time: formatClock(item.start) })} ·{' '}
                  {formatMinutes(item.stop.durationMinutes)}
                </span>
              </p>
              <p className="text-sm text-slate-600">{item.stop.place.address}</p>
              {!compact && item.stop.reason && (
                <p className="text-sm text-slate-700">{item.stop.reason}</p>
              )}
              <p className="text-xs text-slate-500">
                {item.stop.costEstimate > 0
                  ? t('stop.costEstimate', { cost: formatMoney(item.stop.costEstimate, currency) })
                  : t('stop.free')}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {day.stops.length === 0 && <p className="mt-2 text-sm text-slate-600">{t('day.empty')}</p>}
    </section>
  );
}
