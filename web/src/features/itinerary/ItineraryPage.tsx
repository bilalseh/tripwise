import {
  findStop,
  moveStop,
  removeStop,
  toggleLock,
  updateStop,
  promoteRainOption,
  type Day,
} from '@tripwise/shared';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { profileQuery } from '../../lib/queries';
import { WeatherChip } from '../weather/WeatherChip';
import { AddPlaceDialog } from './AddPlaceDialog';
import { AiMenu } from './AiMenu';
import { DayPanel } from './DayPanel';
import { GroundingNotice } from './GroundingNotice';
import { useItineraryStore } from './itineraryStore';
import { useTripContext } from './tripContext';

const TripMap = lazy(() => import('../map/TripMap').then((m) => ({ default: m.TripMap })));

export function ItineraryPage() {
  const { t } = useTranslation();
  const { trip, uid } = useTripContext();
  const days = useItineraryStore((s) => s.history.present.days);
  const apply = useItineraryStore((s) => s.apply);
  const units = useQuery(profileQuery(uid)).data?.preferences.units ?? 'metric';
  const [view, setView] = useState<'day' | 'trip'>('day');
  const [focus, setFocus] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const request = trip.request;
  const editDays = (change: (days: Day[]) => Day[]) => {
    apply((e) => ({ ...e, days: change(e.days) }));
  };

  const dayLabel = (index: number) => t('day.heading', { number: index + 1 });
  const targetsFor = (dayIndex: number) =>
    days.flatMap((day, index) =>
      index !== dayIndex && day.destinationIndex === days[dayIndex]?.destinationIndex
        ? [{ day: index, label: dayLabel(index) }]
        : [],
    );

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || overId === activeId) return;
    const from = findStop(days, activeId);
    if (!from) return;
    const to = overId.startsWith('day:')
      ? { day: Number(overId.slice(4)), index: days[Number(overId.slice(4))]?.stops.length ?? 0 }
      : findStop(days, overId);
    if (!to || days[to.day]?.destinationIndex !== days[from.day]?.destinationIndex) return;
    editDays((current) => moveStop(current, from, to));
  }

  const actions = {
    onToggleLock: (id: string) => {
      editDays((d) => toggleLock(d, id));
    },
    onRemove: (id: string) => {
      editDays((d) => removeStop(d, id));
    },
    onNote: (id: string, note: string) => {
      editDays((d) => updateStop(d, id, { note }));
    },
    onSelect: (id: string) => {
      setSelected(id);
    },
    onMove: (id: string, toDay: number) => {
      editDays((d) => {
        const from = findStop(d, id);
        return from ? moveStop(d, from, { day: toDay, index: d[toDay]?.stops.length ?? 0 }) : d;
      });
    },
  };
  const shown = view === 'day' ? [focus] : days.map((_, index) => index);

  return (
    <div className="mt-4">
      <GroundingNotice report={trip.report ?? null} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <fieldset className="inline-flex rounded-lg bg-slate-200 p-1">
          <legend className="sr-only">{t('itinerary.viewLegend')}</legend>
          {(['day', 'trip'] as const).map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-md px-3 py-1 text-sm font-semibold ${view === value ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              <input
                type="radio"
                name="view"
                className="sr-only"
                checked={view === value}
                onChange={() => {
                  setView(value);
                }}
              />
              {t(`itinerary.view.${value}`)}
            </label>
          ))}
        </fieldset>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {days.map((_, index) => (
            <Button
              key={index}
              size="sm"
              variant={view === 'day' && focus === index ? 'primary' : 'secondary'}
              aria-pressed={view === 'day' && focus === index}
              onClick={() => {
                setView('day');
                setFocus(index);
              }}
            >
              {dayLabel(index)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{ screenReaderInstructions: { draggable: t('dnd.instructions') } }}
          >
            {shown.map((index) => {
              const day = days[index];
              if (!day) return null;
              return (
                <DayPanel
                  key={index}
                  day={day}
                  dayIndex={index}
                  startDate={request.startDate}
                  currency={request.currency}
                  pace={request.pace}
                  units={units}
                  selectedStopId={selected}
                  moveTargets={targetsFor(index)}
                  weather={
                    <WeatherChip uid={uid} tripId={trip.id} dayIndex={index} units={units} />
                  }
                  onUseRainOption={(id) => {
                    editDays((d) => promoteRainOption(d, index, id));
                  }}
                  toolbar={
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAdding(index);
                        }}
                      >
                        {t('itinerary.addPlace')}
                      </Button>
                      <AiMenu trip={trip} dayIndex={index} />
                    </>
                  }
                  {...actions}
                />
              );
            })}
          </DndContext>
        </div>
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-14">
            <Suspense
              fallback={<div className="h-64 rounded-xl bg-slate-100 lg:h-[calc(100dvh-9rem)]" />}
            >
              <TripMap
                days={days}
                focusDay={view === 'day' ? focus : null}
                selectedStopId={selected}
                onSelectStop={(id, dayIndex) => {
                  setSelected(id);
                  if (view === 'day') setFocus(dayIndex);
                  document
                    .getElementById(`day-${String(dayIndex)}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="h-64 sm:h-80 lg:h-[calc(100dvh-9rem)]"
              />
            </Suspense>
          </div>
        </div>
      </div>

      {adding !== null && (
        <AddPlaceDialog
          open
          onClose={() => {
            setAdding(null);
          }}
          destination={
            request.destinations[days[adding]?.destinationIndex ?? 0] ?? request.destinations[0]
          }
          dayIndex={adding}
        />
      )}
    </div>
  );
}
