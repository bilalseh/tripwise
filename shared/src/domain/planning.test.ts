import { describe, expect, it } from 'vitest';

import { setOverride, tripBudget } from './budget';
import { diffDay, isEmptyDiff } from './diff';
import { makeDay, makeStop } from './fixtures';
import { formatClock, scheduleDay } from './schedule';
import { estimateLeg, estimateLegs } from './travel';

const belem = { lat: 38.6979, lng: -9.2068 };
const pasteis = { lat: 38.6975, lng: -9.2032 };
const castle = { lat: 38.7139, lng: -9.1335 };

describe('travel estimates', () => {
  it('walks short legs and drives long ones, always labelled as estimates', () => {
    expect(estimateLeg(belem, pasteis)).toMatchObject({ mode: 'walk', source: 'estimate' });
    const far = estimateLeg(belem, castle);
    expect(far.mode).toBe('drive');
    expect(far.minutes).toBeGreaterThan(10);
    expect(estimateLegs([belem, pasteis, castle])).toHaveLength(2);
  });
});

describe('schedule', () => {
  it('adds travel between stops and respects slot start times', () => {
    const stops = [
      makeStop('a', { durationMinutes: 90 }),
      makeStop('b', { durationMinutes: 30, slot: 'afternoon' }),
      makeStop('c', { durationMinutes: 60, slot: 'evening' }),
    ];
    const legs = [
      { minutes: 10, km: 1, mode: 'walk', source: 'estimate' },
      { minutes: 20, km: 5, mode: 'drive', source: 'osrm' },
    ] as const;
    const times = scheduleDay(stops, legs).map((s) => [formatClock(s.start), formatClock(s.end)]);
    expect(times).toEqual([
      ['09:00', '10:30'],
      ['13:00', '13:30'],
      ['18:00', '19:00'],
    ]);
  });

  it('formats past midnight safely', () => {
    expect(formatClock(25 * 60 + 5)).toBe('01:05');
  });
});

describe('budget', () => {
  const days = [
    makeDay([
      makeStop('a', { costEstimate: 20 }),
      makeStop('f', { category: 'food', costEstimate: 15 }),
    ]),
    makeDay([makeStop('b', { costEstimate: 5 })]),
  ];

  it('totals per category, with food stops counted as food', () => {
    const budget = tripBudget(days, [], 400);
    expect(budget.byCategory).toEqual({ stay: 200, food: 75, transport: 10, activities: 25 });
    expect(budget.total).toBe(310);
    expect(budget.status).toBe('under');
  });

  it('lets the user override any estimate, and clear it again', () => {
    const overrides = setOverride([], 0, 'stay', 60);
    const budget = tripBudget(days, overrides, 300);
    expect(budget.days[0]?.categories[0]).toEqual({
      category: 'stay',
      estimate: 100,
      override: 60,
      amount: 60,
    });
    expect(budget.status).toBe('near');
    expect(setOverride(overrides, 0, 'stay', null)).toEqual([]);
    expect(tripBudget(days, setOverride([], 1, 'food', 999), 300).status).toBe('over');
    expect(tripBudget(days, [], null)).toMatchObject({ status: 'unset', ratio: null });
  });
});

describe('day diff', () => {
  it('reports added, removed and changed stops, and the cost change', () => {
    const before = makeDay([makeStop('a'), makeStop('b'), makeStop('c')]);
    const after = makeDay([makeStop('b', { durationMinutes: 120 }), makeStop('n'), makeStop('a')], {
      rainPlan: [makeStop('r')],
    });
    const diff = diffDay(before, after);
    expect(diff.added.map((s) => s.id)).toEqual(['n']);
    expect(diff.removed.map((s) => s.id)).toEqual(['c']);
    expect(diff.changed.map((c) => [c.after.id, c.fields])).toEqual([
      ['b', ['durationMinutes', 'position']],
      ['a', ['position']],
    ]);
    expect(diff.rainAdded.map((s) => s.id)).toEqual(['r']);
    expect(diff.costAfter).toBe(diff.costBefore);
    expect(isEmptyDiff(diffDay(before, before))).toBe(true);
  });
});
