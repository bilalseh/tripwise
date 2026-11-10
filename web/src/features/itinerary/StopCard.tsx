import type { Stop, TravelLeg } from '@tripwise/shared';
import { formatClock } from '@tripwise/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDistance, formatMinutes, formatMoney } from '../../lib/format';
import { dayColor } from '../map/dayColors';

export interface StopActions {
  onToggleLock: (stopId: string) => void;
  onRemove: (stopId: string) => void;
  onMove: (stopId: string, toDay: number) => void;
  onNote: (stopId: string, note: string) => void;
  onSelect: (stopId: string) => void;
}

interface StopCardProps extends StopActions {
  stop: Stop;
  number: number;
  dayIndex: number;
  start: number;
  currency: string;
  moveTargets: { day: number; label: string }[];
  selected: boolean;
  readOnly?: boolean;
}

export function StopCard({
  stop,
  number,
  dayIndex,
  start,
  currency,
  moveTargets,
  selected,
  readOnly = false,
  ...actions
}: StopCardProps) {
  const { t } = useTranslation();
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(stop.note);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
    disabled: readOnly,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const name = stop.place.name;

  return (
    <article
      ref={setNodeRef}
      style={style}
      aria-label={t('stop.label', { number, name })}
      className={`rounded-xl border bg-white p-3 shadow-sm ${selected ? 'border-brand-600 ring-2 ring-brand-100' : 'border-slate-200'} ${isDragging ? 'z-10 opacity-80 shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-3">
        {!readOnly && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t('stop.drag', { name })}
            className="mt-0.5 cursor-grab touch-none rounded px-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
          >
            ⠿
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            actions.onSelect(stop.id);
          }}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: dayColor(dayIndex) }}
        >
          {number}
          <span className="sr-only"> {t('stop.showOnMap', { name })}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="font-semibold">{name}</h3>
            <span className="text-sm text-slate-600">
              {t('stop.time', { time: formatClock(start) })} · {formatMinutes(stop.durationMinutes)}
            </span>
          </div>
          <p className="truncate text-sm text-slate-500" title={stop.place.address}>
            {stop.place.address}
          </p>
          {stop.reason && <p className="mt-1 text-sm text-slate-700">{stop.reason}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {t(`category.${stop.category}`)} ·{' '}
            {stop.costEstimate > 0
              ? t('stop.costEstimate', { cost: formatMoney(stop.costEstimate, currency) })
              : t('stop.free')}
            {stop.locked && (
              <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
                {t('stop.locked')}
              </span>
            )}
          </p>
          {stop.note && !editingNote && (
            <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-sm text-slate-700">{stop.note}</p>
          )}
          {editingNote && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                actions.onNote(stop.id, note.trim());
                setEditingNote(false);
              }}
            >
              <label className="sr-only" htmlFor={`note-${stop.id}`}>
                {t('stop.note')}
              </label>
              <input
                id={`note-${stop.id}`}
                value={note}
                maxLength={500}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button type="submit" className="text-sm font-semibold text-brand-700">
                {t('actions.save')}
              </button>
            </form>
          )}
          {!readOnly && (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              <button
                type="button"
                aria-pressed={stop.locked}
                onClick={() => {
                  actions.onToggleLock(stop.id);
                }}
                className="rounded px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
              >
                {stop.locked ? t('stop.unlock') : t('stop.lock')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingNote((v) => !v);
                }}
                className="rounded px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
              >
                {t('stop.note')}
              </button>
              {moveTargets.length > 0 && (
                <label className="inline-flex items-center gap-1">
                  <span className="sr-only">{t('stop.moveTo', { name })}</span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) actions.onMove(stop.id, Number(e.target.value));
                    }}
                    className="rounded border border-slate-200 bg-white px-1 py-1 text-sm"
                  >
                    <option value="">{t('stop.move')}</option>
                    {moveTargets.map((target) => (
                      <option key={target.day} value={target.day}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => {
                  actions.onRemove(stop.id);
                }}
                aria-label={t('stop.remove', { name })}
                className="rounded px-2 py-1 font-medium text-red-700 hover:bg-red-50"
              >
                {t('actions.remove')}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function LegRow({ leg, units }: { leg: TravelLeg; units: 'metric' | 'imperial' }) {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-2 ps-12 text-xs text-slate-500">
      <span aria-hidden="true">{leg.mode === 'walk' ? '🚶' : '🚗'}</span>
      {t(`leg.${leg.mode}`, {
        time: formatMinutes(leg.minutes),
        distance: formatDistance(leg.km, units),
      })}
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
        {t(`leg.source.${leg.source}`)}
      </span>
    </p>
  );
}
