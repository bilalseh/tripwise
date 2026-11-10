import { describe, expect, it } from 'vitest';

import {
  addStop,
  findStop,
  moveStop,
  removeStop,
  renameDay,
  toggleLock,
  updateStop,
  promoteRainOption,
} from './edits';
import { makeDay, makeStop } from './fixtures';

const days = () => [
  makeDay([makeStop('a'), makeStop('b'), makeStop('c')]),
  makeDay([makeStop('d')], { rainPlan: [makeStop('r')] }),
];
const ids = (list: ReturnType<typeof days>) => list.map((day) => day.stops.map((s) => s.id));

describe('itinerary edits', () => {
  it('reorders within a day', () => {
    expect(ids(moveStop(days(), { day: 0, index: 0 }, { day: 0, index: 2 }))).toEqual([
      ['b', 'c', 'a'],
      ['d'],
    ]);
  });

  it('moves a stop to another day', () => {
    expect(ids(moveStop(days(), { day: 0, index: 1 }, { day: 1, index: 0 }))).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('clamps a target index past the end', () => {
    expect(ids(moveStop(days(), { day: 0, index: 0 }, { day: 1, index: 99 }))[1]).toEqual([
      'd',
      'a',
    ]);
  });

  it('never mutates its input', () => {
    const before = days();
    const snapshot = JSON.stringify(before);
    moveStop(before, { day: 0, index: 0 }, { day: 1, index: 0 });
    removeStop(before, 'a');
    toggleLock(before, 'b');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('adds, removes, locks and updates stops', () => {
    let next = addStop(days(), 1, makeStop('e'), 0);
    expect(ids(next)[1]).toEqual(['e', 'd']);
    next = removeStop(next, 'e');
    expect(ids(next)[1]).toEqual(['d']);
    next = toggleLock(next, 'a');
    expect(next[0]?.stops[0]?.locked).toBe(true);
    next = updateStop(next, 'a', { note: 'Book ahead', durationMinutes: 90 });
    expect(next[0]?.stops[0]).toMatchObject({
      note: 'Book ahead',
      durationMinutes: 90,
      locked: true,
    });
    expect(findStop(next, 'd')).toEqual({ day: 1, index: 0 });
    expect(findStop(next, 'zzz')).toBeNull();
  });

  it('promotes a rainy-day option into the plan', () => {
    const next = promoteRainOption(days(), 1, 'r');
    expect(ids(next)[1]).toEqual(['d', 'r']);
    expect(next[1]?.rainPlan).toEqual([]);
  });

  it('renames a day', () => {
    expect(renameDay(days(), 0, 'Belém')[0]?.title).toBe('Belém');
  });
});
