import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { formatDate, formatTemperature } from '../../lib/format';
import { profileQuery, weatherQuery } from '../../lib/queries';
import { useTripContext } from '../itinerary/tripContext';
import { condition, ICONS } from './weatherCodes';

export function WeatherPage() {
  const { t } = useTranslation();
  const { trip, uid } = useTripContext();
  const report = useQuery(weatherQuery(uid, trip.id));
  const units = useQuery(profileQuery(uid)).data?.preferences.units ?? 'metric';

  if (report.isPending) return <LoadingState />;
  if (report.isError)
    return (
      <div className="mt-6">
        <ErrorState onRetry={() => void report.refetch()} />
      </div>
    );
  const data = report.data;
  if (data.kind === 'unavailable') {
    return (
      <div className="mt-6">
        <EmptyState
          title={t('weather.unavailableTitle')}
          body={t(trip.request.startDate ? 'weather.unavailableBody' : 'weather.noDates')}
        />
      </div>
    );
  }
  const rainLabel = data.kind === 'forecast' ? 'weather.rainChance' : 'weather.rainAmount';

  return (
    <div className="mt-4">
      <p
        className={`rounded-xl px-4 py-3 text-sm ${data.kind === 'forecast' ? 'bg-sky-50 text-sky-950' : 'bg-amber-50 text-amber-950'}`}
      >
        {t(`weather.explain.${data.kind}`)}
      </p>
      {data.destinations.map((entry) => (
        <section key={entry.destinationIndex} className="mt-4">
          <h2 className="text-lg font-semibold">
            {trip.request.destinations[entry.destinationIndex]?.name}
          </h2>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {entry.days.map((day) => {
              const kind = condition(day.code);
              return (
                <li
                  key={day.date}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-center"
                >
                  <p className="text-sm font-medium">{formatDate(day.date)}</p>
                  <p className="my-1 text-2xl" aria-hidden="true">
                    {ICONS[kind]}
                  </p>
                  <p className="text-sm">{t(`weather.condition.${kind}`)}</p>
                  <p className="text-sm font-semibold">
                    {day.tempMax !== null ? formatTemperature(day.tempMax, units) : '?'} /{' '}
                    {day.tempMin !== null ? formatTemperature(day.tempMin, units) : '?'}
                  </p>
                  {day.precipitation !== null && (
                    <p className="text-xs text-slate-600">
                      {t(rainLabel, { value: Math.round(day.precipitation) })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="mt-4 text-xs text-slate-500">{data.attribution}</p>
    </div>
  );
}
