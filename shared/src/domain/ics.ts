/**
 * An iCalendar (RFC 5545) file of the trip: one event per stop at its estimated time. Times are
 * "floating" (no time zone), so they show at the same clock time wherever the calendar is,
 * which is what a traveller wants for local plans.
 */
import type { Day, TravelLeg } from '../generated/types';
import { scheduleDay } from './schedule';
import { estimateLegs } from './travel';

export interface IcsTrip {
  id: string;
  title: string;
  startDate: string | null; // YYYY-MM-DD
  days: readonly Day[];
}

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded with CRLF + space (counting UTF-8 bytes). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function addDays(isoDate: string, days: number): Date {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function stamp(date: Date, minutes: number): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}00`;
}

export function buildIcs(
  trip: IcsTrip,
  now: Date,
  legsFor: (day: Day) => readonly TravelLeg[] = (day) =>
    estimateLegs(day.stops.map((stop) => stop.place.location)),
): string | null {
  if (!trip.startDate) return null;
  const created = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tripwise//Trip planner//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(trip.title)}`,
  ];
  for (const [index, day] of trip.days.entries()) {
    const date = addDays(trip.startDate, index);
    for (const item of scheduleDay(day.stops, legsFor(day))) {
      const { stop } = item;
      const description = [stop.reason, `Estimated ${stop.durationMinutes} min`, stop.note]
        .filter(Boolean)
        .join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${trip.id}-${stop.id}@tripwise`,
        `DTSTAMP:${created}`,
        `DTSTART:${stamp(date, item.start)}`,
        `DTEND:${stamp(date, Math.min(item.end, 24 * 60 - 1))}`,
        `SUMMARY:${escapeText(stop.place.name)}`,
        `LOCATION:${escapeText(stop.place.address)}`,
        `GEO:${stop.place.location.lat.toFixed(6)};${stop.place.location.lng.toFixed(6)}`,
        `DESCRIPTION:${escapeText(description)}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
