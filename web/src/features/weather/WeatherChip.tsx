import type { Units } from '@tripwise/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { formatTemperature } from '../../lib/format';
import { weatherQuery } from '../../lib/queries';
import { condition, dayWeather, ICONS } from './weatherCodes';

export function WeatherChip({
  uid,
  tripId,
  dayIndex,
  units,
}: {
  uid: string;
  tripId: string;
  dayIndex: number;
  units: Units;
}) {
  const { t } = useTranslation();
  const report = useQuery(weatherQuery(uid, tripId)).data;
  const day = dayWeather(report, dayIndex);
  const high = day?.tempMax ?? null;
  if (!report || !day || high === null) return null;
  const kind = condition(day.code);
  const label = `${t(`weather.condition.${kind}`)}, ${formatTemperature(high, units)}`;
  return (
    <span
      title={t(`weather.kind.${report.kind}`)}
      className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs ring-1 ring-slate-200"
    >
      <span aria-hidden="true">{ICONS[kind]}</span>
      <span>{label}</span>
      {report.kind === 'typical' && (
        <span className="text-slate-500">({t('weather.typicalShort')})</span>
      )}
    </span>
  );
}
