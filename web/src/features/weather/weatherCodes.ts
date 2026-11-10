import type { WeatherDay, WeatherReport } from '@tripwise/shared';

/** WMO weather codes grouped into the few conditions a traveller cares about. */
export function condition(
  code: number | null,
): 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm' | 'unknown' {
  if (code === null) return 'unknown';
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 77 || code === 85 || code === 86) return 'snow';
  return 'storm';
}

export const ICONS = {
  clear: '☀️',
  cloudy: '⛅',
  fog: '🌫️',
  rain: '🌧️',
  snow: '❄️',
  storm: '⛈️',
  unknown: '·',
} as const;

export function dayWeather(report: WeatherReport | undefined, dayIndex: number): WeatherDay | null {
  if (!report || report.kind === 'unavailable') return null;
  const all = report.destinations.flatMap((d) => d.days);
  return all[dayIndex] ?? null;
}
