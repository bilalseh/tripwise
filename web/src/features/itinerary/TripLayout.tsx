import type { Trip } from '@tripwise/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useParams } from 'react-router';

import { ErrorState, LoadingState } from '../../components/States';
import { isApiError } from '../../lib/apiClient';
import { formatDate, addDays } from '../../lib/format';
import { tripQuery } from '../../lib/queries';
import { useUid } from '../auth/useUid';
import { GenerationView } from './GenerationView';
import { useItineraryStore } from './itineraryStore';
import { SaveBar } from './SaveBar';
import type { TripContext } from './tripContext';
import { TripActions } from './TripActions';
import { useAutosave } from './useAutosave';
import { useGeneration } from './useGeneration';
import { useUndoShortcuts } from './useUndoShortcuts';

const TABS = [
  { to: '', key: 'plan', end: true },
  { to: 'budget', key: 'budget', end: false },
  { to: 'packing', key: 'packing', end: false },
  { to: 'documents', key: 'documents', end: false },
  { to: 'weather', key: 'weather', end: false },
] as const;

export function TripLayout() {
  const { t } = useTranslation();
  const uid = useUid();
  const { tripId = '' } = useParams();
  const query = useQuery(tripQuery(uid, tripId));
  const load = useItineraryStore((s) => s.load);
  const loadedId = useItineraryStore((s) => s.tripId);
  const title = useItineraryStore((s) => s.history.present.title);
  const { retry } = useAutosave(uid);
  useUndoShortcuts();

  const trip = query.data;
  const generation = useGeneration(
    uid,
    trip,
    useCallback(
      (done: Trip) => {
        load(done);
      },
      [load],
    ),
  );

  useEffect(() => {
    if (trip && loadedId !== trip.id) load(trip);
  }, [trip, loadedId, load]);

  if (query.isPending) return <LoadingState />;
  if (query.isError || !trip) {
    return (
      <div className="px-4 py-16">
        <ErrorState
          message={isApiError(query.error, 404) ? t('trip.notFound') : undefined}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const total = trip.request.destinations.reduce((sum, d) => sum + d.days, 0);
  const start = trip.request.startDate;
  const needsDays = trip.days.length < total || generation.running;
  const context: TripContext = { trip, uid };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            {loadedId === trip.id ? title : trip.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {trip.request.destinations.map((d) => d.name).join(' · ')}
            {' · '}
            {start
              ? `${formatDate(start)} - ${formatDate(addDays(start, total - 1))}`
              : t('trip.dayCount', { count: total })}
          </p>
        </div>
        {!needsDays && (
          <TripActions
            trip={trip}
            uid={uid}
            onRegenerate={() => {
              generation.start(0);
            }}
          />
        )}
      </header>

      {needsDays ? (
        <div className="py-10">
          <GenerationView generation={generation} />
        </div>
      ) : loadedId !== trip.id ? (
        <LoadingState />
      ) : (
        <>
          <nav
            aria-label={t('trip.sections')}
            className="-mx-4 mt-5 overflow-x-auto border-b border-slate-200 px-4"
          >
            <ul className="flex gap-1">
              {TABS.map((tab) => (
                <li key={tab.key}>
                  <NavLink
                    to={tab.to}
                    end={tab.end}
                    className={({ isActive }) =>
                      `block border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap ${isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`
                    }
                  >
                    {t(`trip.tabs.${tab.key}`)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <SaveBar onRetry={retry} />
          <Outlet context={context} />
        </>
      )}
    </div>
  );
}
