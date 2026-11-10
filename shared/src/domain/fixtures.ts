import type { Day, Stop } from '../generated/types';

export function makeStop(id: string, overrides: Partial<Stop> = {}): Stop {
  return {
    id,
    place: {
      name: `Place ${id}`,
      address: `${id} Street, Lisbon`,
      location: { lat: 38.71, lng: -9.14 },
      osmId: null,
      source: 'fake',
    },
    category: 'sight',
    slot: 'morning',
    reason: '',
    durationMinutes: 60,
    costEstimate: 10,
    locked: false,
    note: '',
    ...overrides,
  };
}

export function makeDay(stops: Stop[], overrides: Partial<Day> = {}): Day {
  return {
    title: 'Day',
    destinationIndex: 0,
    stops,
    rainPlan: [],
    estimates: { stay: 100, food: 30, transport: 5 },
    ...overrides,
  };
}
