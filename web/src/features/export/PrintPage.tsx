import { CATEGORIES, tripBudget } from '@tripwise/shared';
import { useQuery } from '@tanstack/react-query';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { ErrorState, LoadingState } from '../../components/States';
import { addDays, formatDate, formatMoney } from '../../lib/format';
import { tripQuery } from '../../lib/queries';
import { useUid } from '../auth/useUid';
import { ReadOnlyDay } from '../share/ReadOnlyDay';

const TripMap = lazy(() => import('../map/TripMap').then((m) => ({ default: m.TripMap })));

/**
 * The PDF itinerary: a print-ready page the browser saves as PDF. Printing keeps Arabic text
 * shaping and right-to-left layout correct, which PDF libraries in the browser get wrong. The
 * live map is swapped for a snapshot image once its tiles have loaded.
 */
export function PrintPage() {
  const { t } = useTranslation();
  const uid = useUid();
  const { tripId = '' } = useParams();
  const query = useQuery(tripQuery(uid, tripId));
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!map) return;
    const capture = () => {
      try {
        setSnapshot(map.getCanvas().toDataURL('image/png'));
      } catch {
        setSnapshot(null); // tainted canvas or no WebGL: the PDF just has no map
      }
    };
    map.once('idle', capture);
  }, [map]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const trip = query.data;
  const request = trip.request;
  const total = request.destinations.reduce((sum, d) => sum + d.days, 0);
  const budget = tripBudget(trip.days, trip.overrides, request.budgetAmount ?? null);

  return (
    <div className="mx-auto max-w-3xl bg-white px-6 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <Button
          onClick={() => {
            window.print();
          }}
        >
          {t('print.save')}
        </Button>
        <Link to={`/trips/${trip.id}`} className={buttonClass('ghost')}>
          {t('print.back')}
        </Link>
        <p className="w-full text-sm text-slate-600">{t('print.hint')}</p>
      </div>
      <header>
        <p className="text-sm font-semibold text-brand-700">Tripwise</p>
        <h1 className="text-3xl font-bold">{trip.title}</h1>
        <p className="mt-1 text-slate-600">
          {request.destinations.map((d) => d.name).join(' · ')}
          {' · '}
          {request.startDate
            ? `${formatDate(request.startDate)} - ${formatDate(addDays(request.startDate, total - 1))}`
            : t('trip.dayCount', { count: total })}
        </p>
      </header>
      <div className="mt-4 h-72 print:h-64">
        {snapshot ? (
          <img
            src={snapshot}
            alt={t('print.mapAlt')}
            className="h-full w-full rounded-lg object-cover"
          />
        ) : (
          <Suspense fallback={null}>
            <TripMap
              days={trip.days}
              focusDay={null}
              preserveDrawingBuffer
              onReady={setMap}
              className="h-full"
            />
          </Suspense>
        )}
      </div>
      <section className="mt-6 break-inside-avoid">
        <h2 className="text-lg font-semibold">{t('print.budget')}</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {CATEGORIES.map((category) => (
              <tr key={category} className="border-b border-slate-100">
                <th scope="row" className="py-1 text-start font-normal">
                  {t(`budget.category.${category}`)}
                </th>
                <td className="py-1 text-end">
                  {formatMoney(budget.byCategory[category], request.currency)}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-1 text-start">
                {t('budget.total')}
              </th>
              <td className="py-1 text-end font-semibold">
                {formatMoney(budget.total, request.currency)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">
          {t('budget.disclaimer', { currency: request.currency })}
        </p>
      </section>
      <div className="mt-6 flex flex-col gap-4">
        {trip.days.map((day, index) => (
          <ReadOnlyDay
            key={index}
            day={day}
            dayIndex={index}
            startDate={request.startDate}
            currency={request.currency}
            compact
          />
        ))}
      </div>
      <p className="mt-6 text-xs text-slate-500">{t('print.footer')}</p>
    </div>
  );
}
