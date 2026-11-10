/**
 * Itinerary edit operations. Every function is pure: it returns new days and never mutates its
 * input, so each result can go straight onto the undo stack.
 */
import type { Day, Stop } from '../generated/types';

export interface StopPosition {
  day: number;
  index: number;
}

function replaceDay(days: readonly Day[], dayIndex: number, change: (day: Day) => Day): Day[] {
  return days.map((day, index) => (index === dayIndex ? change(day) : day));
}

export function findStop(days: readonly Day[], stopId: string): StopPosition | null {
  for (const [day, entry] of days.entries()) {
    const index = entry.stops.findIndex((stop) => stop.id === stopId);
    if (index >= 0) return { day, index };
  }
  return null;
}

/** Move a stop to another position, on the same day or another one. */
export function moveStop(days: readonly Day[], from: StopPosition, to: StopPosition): Day[] {
  const stop = days[from.day]?.stops[from.index];
  const target = days[to.day];
  if (!stop || !target) return [...days];
  const without = replaceDay(days, from.day, (day) => ({
    ...day,
    stops: day.stops.filter((_, index) => index !== from.index),
  }));
  return replaceDay(without, to.day, (day) => {
    const stops = [...day.stops];
    stops.splice(Math.max(0, Math.min(to.index, stops.length)), 0, stop);
    return { ...day, stops };
  });
}

export function addStop(days: readonly Day[], dayIndex: number, stop: Stop, at?: number): Day[] {
  return replaceDay(days, dayIndex, (day) => {
    const stops = [...day.stops];
    stops.splice(at ?? stops.length, 0, stop);
    return { ...day, stops };
  });
}

export function removeStop(days: readonly Day[], stopId: string): Day[] {
  return days.map((day) => ({
    ...day,
    stops: day.stops.filter((stop) => stop.id !== stopId),
    rainPlan: day.rainPlan.filter((stop) => stop.id !== stopId),
  }));
}

export function updateStop(
  days: readonly Day[],
  stopId: string,
  patch: Partial<Pick<Stop, 'locked' | 'note' | 'durationMinutes' | 'costEstimate' | 'slot'>>,
): Day[] {
  return days.map((day) => ({
    ...day,
    stops: day.stops.map((stop) => (stop.id === stopId ? { ...stop, ...patch } : stop)),
  }));
}

export function toggleLock(days: readonly Day[], stopId: string): Day[] {
  const position = findStop(days, stopId);
  const stop = position ? days[position.day]?.stops[position.index] : undefined;
  return stop ? updateStop(days, stopId, { locked: !stop.locked }) : [...days];
}

/** Promote a rainy-day alternative into the day's plan (at the end of its slot group). */
export function promoteRainOption(days: readonly Day[], dayIndex: number, stopId: string): Day[] {
  return replaceDay(days, dayIndex, (day) => {
    const option = day.rainPlan.find((stop) => stop.id === stopId);
    if (!option) return day;
    return {
      ...day,
      stops: [...day.stops, option],
      rainPlan: day.rainPlan.filter((stop) => stop.id !== stopId),
    };
  });
}

export function replaceDayAt(days: readonly Day[], dayIndex: number, next: Day): Day[] {
  return replaceDay(days, dayIndex, () => next);
}

export function renameDay(days: readonly Day[], dayIndex: number, title: string): Day[] {
  return replaceDay(days, dayIndex, (day) => ({ ...day, title }));
}
