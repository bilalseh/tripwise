import type { Stop, TravelLeg } from '../generated/types';

export interface ScheduledStop {
  stop: Stop;
  /** Minutes after midnight, local time at the destination. */
  start: number;
  end: number;
  /** Travel from the previous stop; null for the first. */
  legBefore: TravelLeg | null;
}

export const DAY_START = 9 * 60;
const EVENING_START = 18 * 60;
const AFTERNOON_START = 13 * 60;

/**
 * Rough timetable for a day: visits in order with travel between them. Afternoon and evening
 * stops never start before 13:00 and 18:00, so a short morning leaves a gap rather than an
 * evening dinner at 11:30. All times are estimates.
 */
export function scheduleDay(
  stops: readonly Stop[],
  legs: readonly TravelLeg[],
  dayStart = DAY_START,
): ScheduledStop[] {
  let clock = dayStart;
  return stops.map((stop, index) => {
    const legBefore = index > 0 ? (legs[index - 1] ?? null) : null;
    clock += legBefore?.minutes ?? 0;
    if (stop.slot === 'afternoon') clock = Math.max(clock, AFTERNOON_START);
    if (stop.slot === 'evening') clock = Math.max(clock, EVENING_START);
    const start = clock;
    clock += stop.durationMinutes;
    return { stop, start, end: clock, legBefore };
  });
}

export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function totalMinutes(stops: readonly Stop[], legs: readonly TravelLeg[]): number {
  const visits = stops.reduce((sum, stop) => sum + stop.durationMinutes, 0);
  return visits + legs.reduce((sum, leg) => sum + leg.minutes, 0);
}
