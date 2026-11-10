import { scheduleDay, totalMinutes, type Day, type Units } from '@tripwise/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { addDays, formatDate, formatMinutes } from '../../lib/format';
import { dayColor } from '../map/dayColors';
import { LegRow, StopCard, type StopActions } from './StopCard';
import { useDayLegs } from './useDayLegs';

const PACE_MINUTES = { relaxed: 360, balanced: 480, packed: 630 } as const;

interface DayPanelProps extends StopActions {
  day: Day;
  dayIndex: number;
  startDate: string | null;
  currency: string;
  pace: keyof typeof PACE_MINUTES;
  units: Units;
  selectedStopId: string | null;
  moveTargets: { day: number; label: string }[];
  readOnly?: boolean;
  toolbar?: ReactNode;
  weather?: ReactNode;
  onUseRainOption?: (stopId: string) => void;
}

export function DayPanel({
  day,
  dayIndex,
  startDate,
  currency,
  pace,
  units,
  selectedStopId,
  moveTargets,
  readOnly = false,
  toolbar,
  weather,
  onUseRainOption,
  ...actions
}: DayPanelProps) {
  const { t } = useTranslation();
  const legs = useDayLegs(day.stops);
  const schedule = scheduleDay(day.stops, legs);
  const minutes = totalMinutes(day.stops, legs);
  const overloaded = minutes > PACE_MINUTES[pace];
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${String(dayIndex)}`,
    disabled: readOnly,
  });
  const heading = t('day.heading', { number: dayIndex + 1 });

  return (
    <section
      aria-labelledby={`day-${String(dayIndex)}-title`}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"
      id={`day-${String(dayIndex)}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id={`day-${String(dayIndex)}-title`}
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-full"
              style={{ background: dayColor(dayIndex) }}
            />
            {heading}
            {startDate && (
              <span className="text-sm font-normal text-slate-600">
                {formatDate(addDays(startDate, dayIndex))}
              </span>
            )}
          </h2>
          {day.title && <p className="text-sm text-slate-700">{day.title}</p>}
          <p
            className={`mt-0.5 text-xs ${overloaded ? 'font-semibold text-amber-800' : 'text-slate-500'}`}
          >
            {t('day.total', { time: formatMinutes(minutes) })}
            {overloaded && ` · ${t('day.overloaded')}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {weather}
          {toolbar}
        </div>
      </header>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-col gap-2 rounded-xl ${isOver ? 'bg-brand-50' : ''}`}
      >
        <SortableContext items={day.stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {day.stops.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
              {t('day.empty')}
            </p>
          )}
          {schedule.map((item, index) => (
            <div key={item.stop.id} className="flex flex-col gap-2">
              {item.legBefore && <LegRow leg={item.legBefore} units={units} />}
              <StopCard
                stop={item.stop}
                number={index + 1}
                dayIndex={dayIndex}
                start={item.start}
                currency={currency}
                moveTargets={moveTargets}
                selected={selectedStopId === item.stop.id}
                readOnly={readOnly}
                {...actions}
              />
            </div>
          ))}
        </SortableContext>
      </div>

      {day.rainPlan.length > 0 && (
        <details className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-semibold">
            {t('day.rainPlan', { count: day.rainPlan.length })}
          </summary>
          <ul className="mt-2 space-y-2">
            {day.rainPlan.map((stop) => (
              <li key={stop.id} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{stop.place.name}</span>
                  <span className="block text-slate-500">{stop.place.address}</span>
                </span>
                {!readOnly && onUseRainOption && (
                  <button
                    type="button"
                    onClick={() => {
                      onUseRainOption(stop.id);
                    }}
                    className="shrink-0 font-semibold text-brand-700"
                  >
                    {t('day.useRain')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
