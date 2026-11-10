import type { Units } from '@tripwise/shared';

import { currentLanguage } from '../i18n';

const LOCALES = { en: 'en-GB', ar: 'ar' } as const;

export function intlLocale(language = currentLanguage()): string {
  return LOCALES[language];
}

export function formatMoney(
  amount: number,
  currency: string,
  language = currentLanguage(),
): string {
  try {
    return new Intl.NumberFormat(intlLocale(language), {
      style: 'currency',
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

/** A calendar date (YYYY-MM-DD) shown in the user's language, never shifted by time zones. */
export function formatDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
  language = currentLanguage(),
): string {
  return new Intl.DateTimeFormat(intlLocale(language), { ...options, timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const KM_PER_MILE = 1.609344;

export function formatDistance(km: number, units: Units, language = currentLanguage()): string {
  const value = units === 'imperial' ? km / KM_PER_MILE : km;
  const unit = units === 'imperial' ? 'mile' : 'kilometer';
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

export function formatTemperature(
  celsius: number,
  units: Units,
  language = currentLanguage(),
): string {
  const value = units === 'imperial' ? celsius * 1.8 + 32 : celsius;
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'unit',
    unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMinutes(minutes: number, language = currentLanguage()): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const format = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(intlLocale(language), {
      style: 'unit',
      unit,
      unitDisplay: 'narrow',
    }).format(value);
  if (!hours) return format(rest, 'minute');
  return rest ? `${format(hours, 'hour')} ${format(rest, 'minute')}` : format(hours, 'hour');
}
