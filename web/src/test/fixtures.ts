import type { Day, Profile, Stop, Trip } from '@tripwise/shared';

export const PROFILE: Profile = {
  uid: 'demo-uid',
  displayName: null,
  email: null,
  isDemo: true,
  createdAt: '2026-11-10T09:00:00Z',
  tier: 'free',
  preferences: { language: 'en', homeCurrency: 'EUR', units: 'metric' },
};

export function stop(id: string, name: string, overrides: Partial<Stop> = {}): Stop {
  return {
    id,
    place: {
      name,
      address: `${name}, Lisbon, Portugal`,
      location: { lat: 38.71, lng: -9.14 },
      osmId: null,
      source: 'seed',
    },
    category: 'sight',
    slot: 'morning',
    reason: `Why ${name}`,
    durationMinutes: 60,
    costEstimate: 10,
    locked: false,
    note: '',
    ...overrides,
  };
}

export function day(stops: Stop[], overrides: Partial<Day> = {}): Day {
  return {
    title: 'A day',
    destinationIndex: 0,
    stops,
    rainPlan: [],
    estimates: { stay: 100, food: 40, transport: 5 },
    ...overrides,
  };
}

export function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'demo-lisbon',
    title: 'Lisbon city break',
    request: {
      destinations: [
        {
          name: 'Lisbon',
          displayName: 'Lisbon, Portugal',
          country: 'Portugal',
          countryCode: 'pt',
          location: { lat: 38.72, lng: -9.14 },
          radiusKm: null,
          days: 2,
        },
      ],
      startDate: '2026-11-20',
      travelers: { party: 'couple', adults: 2, children: 0 },
      budgetLevel: 'moderate',
      budgetAmount: 500,
      currency: 'EUR',
      interests: ['food'],
      pace: 'balanced',
      constraints: { mobility: 'none', dietary: [], mustSee: [], notes: '' },
    },
    status: 'ready',
    days: [
      day([stop('a', 'Belém Tower'), stop('b', 'Pastéis de Belém', { category: 'food' })]),
      day([stop('c', 'São Jorge Castle', { locked: true })]),
    ],
    overrides: [],
    version: 3,
    createdAt: '2026-11-10T09:00:00Z',
    updatedAt: '2026-11-10T09:00:00Z',
    shareToken: null,
    report: { provider: 'fake', suggested: 5, kept: 3, dropped: ['Invented Garden'], trimmed: [] },
    ...overrides,
  };
}
