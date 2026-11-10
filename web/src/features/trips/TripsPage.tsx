import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { buttonClass } from '../../components/buttonClass';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { addDays, formatDate } from '../../lib/format';
import { tripsQuery, usageQuery } from '../../lib/queries';
import { useAuthUser } from '../auth/useAuthUser';
import { useUid } from '../auth/useUid';

export function TripsPage() {
  const { t } = useTranslation();
  const uid = useUid();
  const user = useAuthUser();
  const trips = useQuery(tripsQuery(uid));
  const usage = useQuery(usageQuery(uid));
  const full = usage.data?.tripLimit != null && usage.data.trips >= usage.data.tripLimit;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {user?.isAnonymous && (
        <p role="note" className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t('trips.demoNote')}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{t('trips.title')}</h1>
        {full ? (
          <Link to="/pricing" className={buttonClass('secondary')}>
            {t('trips.limitReached')}
          </Link>
        ) : (
          <Link to="/trips/new" className={buttonClass()}>
            {t('trips.new')}
          </Link>
        )}
      </div>
      {usage.data && (
        <p className="mt-1 text-sm text-slate-600">
          {usage.data.tripLimit === null
            ? t('trips.usageUnlimited', { ai: usage.data.aiUsed, aiLimit: usage.data.aiLimit })
            : t('trips.usage', {
                count: usage.data.trips,
                limit: usage.data.tripLimit,
                ai: usage.data.aiUsed,
                aiLimit: usage.data.aiLimit,
              })}
        </p>
      )}
      <div className="mt-6">
        {trips.isPending && <LoadingState />}
        {trips.isError && <ErrorState onRetry={() => void trips.refetch()} />}
        {trips.data?.length === 0 && (
          <EmptyState
            title={t('trips.emptyTitle')}
            body={t('trips.emptyBody')}
            action={
              <Link to="/trips/new" className={buttonClass()}>
                {t('trips.new')}
              </Link>
            }
          />
        )}
        {trips.data && trips.data.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.data.map((trip) => (
              <li key={trip.id}>
                <Link
                  to={`/trips/${trip.id}`}
                  className="block h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <h2 className="text-lg font-semibold">{trip.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{trip.destinations.join(' · ')}</p>
                  <p className="mt-3 text-sm text-slate-700">
                    {trip.startDate
                      ? `${formatDate(trip.startDate)} - ${formatDate(addDays(trip.startDate, trip.totalDays - 1))}`
                      : t('trip.dayCount', { count: trip.totalDays })}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {trip.status === 'draft'
                      ? t('trips.draft')
                      : t('trips.stops', { count: trip.stops })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
