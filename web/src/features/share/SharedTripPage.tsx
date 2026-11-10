import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { buttonClass } from '../../components/buttonClass';
import { EmptyState, LoadingState } from '../../components/States';
import { addDays, formatDate } from '../../lib/format';
import { sharedTripQuery } from '../../lib/queries';
import { ReadOnlyDay } from './ReadOnlyDay';

const TripMap = lazy(() => import('../map/TripMap').then((m) => ({ default: m.TripMap })));

/** The public, read-only view behind a share link: no sign-in, no editing, no private notes. */
export function SharedTripPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const query = useQuery(sharedTripQuery(token));
  const [focus, setFocus] = useState<number | null>(null);

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <div className="px-4 py-16">
        <EmptyState
          title={t('shared.missingTitle')}
          body={t('shared.missingBody')}
          action={
            <Link to="/" className={buttonClass()}>
              {t('shared.planYourOwn')}
            </Link>
          }
        />
      </div>
    );
  }
  const trip = query.data;
  const total = trip.destinations.reduce((sum, d) => sum + d.days, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <p className="mb-3 inline-block rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
        {t('shared.badge')}
      </p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{trip.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {trip.destinations.map((d) => d.name).join(' · ')}
        {' · '}
        {trip.startDate
          ? `${formatDate(trip.startDate)} - ${formatDate(addDays(trip.startDate, total - 1))}`
          : t('trip.dayCount', { count: total })}
      </p>
      <div className="mt-4 flex gap-1 overflow-x-auto">
        <button
          type="button"
          aria-pressed={focus === null}
          onClick={() => {
            setFocus(null);
          }}
          className={buttonClass(focus === null ? 'primary' : 'secondary', 'sm')}
        >
          {t('itinerary.view.trip')}
        </button>
        {trip.days.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={focus === index}
            onClick={() => {
              setFocus(index);
            }}
            className={buttonClass(focus === index ? 'primary' : 'secondary', 'sm')}
          >
            {t('day.heading', { number: index + 1 })}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          {trip.days.map((day, index) =>
            focus === null || focus === index ? (
              <ReadOnlyDay
                key={index}
                day={day}
                dayIndex={index}
                startDate={trip.startDate}
                currency={trip.currency}
              />
            ) : null,
          )}
        </div>
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-4">
            <Suspense fallback={<div className="h-64 rounded-xl bg-slate-100" />}>
              <TripMap
                days={trip.days}
                focusDay={focus}
                className="h-64 sm:h-80 lg:h-[calc(100dvh-8rem)]"
              />
            </Suspense>
          </div>
        </div>
      </div>
      <p className="mt-8 text-center text-sm text-slate-600">
        {t('shared.cta')}{' '}
        <Link to="/" className="font-semibold text-brand-700 underline">
          {t('shared.planYourOwn')}
        </Link>
      </p>
    </div>
  );
}
