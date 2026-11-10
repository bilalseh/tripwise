import type { Day, Stop } from '../generated/types';

export interface ChangedStop {
  before: Stop;
  after: Stop;
  fields: ('slot' | 'durationMinutes' | 'costEstimate' | 'position')[];
}

export interface DayDiff {
  added: Stop[];
  removed: Stop[];
  changed: ChangedStop[];
  unchanged: Stop[];
  rainAdded: Stop[];
  costBefore: number;
  costAfter: number;
}

const dayCost = (day: Day): number =>
  day.stops.reduce((sum, stop) => sum + stop.costEstimate, 0) +
  day.estimates.food +
  day.estimates.transport +
  day.estimates.stay;

/** What an AI proposal changes on a day, for the accept/reject preview. */
export function diffDay(before: Day, after: Day): DayDiff {
  const old = new Map(before.stops.map((stop, index) => [stop.id, { stop, index }]));
  const kept = new Set(after.stops.map((stop) => stop.id));
  const changed: ChangedStop[] = [];
  const unchanged: Stop[] = [];
  const added: Stop[] = [];
  for (const [index, stop] of after.stops.entries()) {
    const previous = old.get(stop.id);
    if (!previous) {
      added.push(stop);
      continue;
    }
    const fields: ChangedStop['fields'] = [];
    if (previous.stop.slot !== stop.slot) fields.push('slot');
    if (previous.stop.durationMinutes !== stop.durationMinutes) fields.push('durationMinutes');
    if (previous.stop.costEstimate !== stop.costEstimate) fields.push('costEstimate');
    if (previous.index !== index) fields.push('position');
    if (fields.length) changed.push({ before: previous.stop, after: stop, fields });
    else unchanged.push(stop);
  }
  const oldRain = new Set(before.rainPlan.map((stop) => stop.id));
  return {
    added,
    removed: before.stops.filter((stop) => !kept.has(stop.id)),
    changed,
    unchanged,
    rainAdded: after.rainPlan.filter((stop) => !oldRain.has(stop.id)),
    costBefore: dayCost(before),
    costAfter: dayCost(after),
  };
}

export function isEmptyDiff(diff: DayDiff): boolean {
  return (
    !diff.added.length && !diff.removed.length && !diff.changed.length && !diff.rainAdded.length
  );
}
