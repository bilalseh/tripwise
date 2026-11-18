import type { Trip } from '@tripwise/shared';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { fakeApi, FakeResponse } from '../../test/fakeApi';
import { DEMO_USER, fakeSession } from '../../test/fakeSession';
import { day, PROFILE, stop, trip } from '../../test/fixtures';
import { renderRoute } from '../../test/renderRoute';
import { retryDelays } from './generationRetry';

interface GenerateBody {
  firstDay: number;
  dayCount: number;
}

const destination = trip().request.destinations[0];

function draft(): Trip {
  return trip({
    status: 'draft',
    days: [],
    request: { ...trip().request, destinations: [{ ...destination, days: 8 }] },
  });
}

/** A server that plans the requested days, and refuses batches `refuses` says are too big. */
function server(refuses: (body: GenerateBody) => boolean) {
  let current = draft();
  return fakeApi({
    'GET /health': () => ({ status: 'ok', version: 't' }),
    'POST /me': () => PROFILE,
    'GET /me/usage': () => ({
      aiUsed: 0,
      aiLimit: 20,
      resetsAt: '2026-11-19T00:00:00Z',
      tier: 'free',
      trips: 1,
      tripLimit: 5,
    }),
    'GET /trips': () => [],
    'GET /trips/demo-lisbon': () => current,
    'GET /trips/demo-lisbon/weather': () => ({
      kind: 'unavailable',
      destinations: [],
      attribution: 'Open-Meteo',
    }),
    'POST /trips/demo-lisbon/generate': (raw) => {
      const body = raw as GenerateBody;
      if (refuses(body)) throw new FakeResponse(503, { detail: { code: 'ai_unavailable' } });
      const count = Math.min(body.dayCount, 8 - body.firstDay);
      const planned = Array.from({ length: count }, (_, offset) =>
        day([
          stop(`s${String(body.firstDay + offset)}`, `Place ${String(body.firstDay + offset)}`),
        ]),
      );
      current = { ...current, days: [...current.days.slice(0, body.firstDay), ...planned] };
      return current;
    },
  });
}

const batches = (api: ReturnType<typeof fakeApi>) =>
  api.calls
    .filter((call) => call.key === 'POST /trips/demo-lisbon/generate')
    .map((call) => call.body as GenerateBody)
    .map((body) => [body.firstDay, body.dayCount]);

describe('trip generation', () => {
  beforeEach(() => {
    fakeSession.setUser(DEMO_USER);
    retryDelays.smallerBatch = 1;
    retryDelays.rateLimit = 1;
  });

  it('plans long trips two days at a time', async () => {
    const api = server(() => false);
    renderRoute('/trips/demo-lisbon');

    expect(await screen.findByRole('region', { name: /Day 1/ }, { timeout: 8000 })).toBeVisible();
    expect(batches(api)).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
      [6, 2],
    ]);
  }, 10_000);

  it('retries a failed batch one day at a time and keeps the days already planned', async () => {
    const api = server((body) => body.firstDay === 4 && body.dayCount === 2);
    renderRoute('/trips/demo-lisbon');

    expect(await screen.findByRole('region', { name: /Day 1/ }, { timeout: 8000 })).toBeVisible();
    expect(batches(api)).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
      [4, 1],
      [5, 2],
      [7, 2],
    ]);
  }, 10_000);

  it('retries when an earlier try of the same days saved first', async () => {
    let stale = false;
    const api = server((body) => {
      if (body.firstDay !== 2 || stale) return false;
      stale = true;
      throw new FakeResponse(409, { detail: { code: 'stale_version' } });
    });
    renderRoute('/trips/demo-lisbon');

    expect(await screen.findByRole('region', { name: /Day 1/ }, { timeout: 8000 })).toBeVisible();
    expect(batches(api).slice(0, 3)).toEqual([
      [0, 2],
      [2, 2],
      [2, 1],
    ]);
  }, 10_000);

  it('survives a dropped connection', async () => {
    let dropped = false;
    const api = server((body) => {
      if (body.firstDay !== 2 || dropped) return false;
      dropped = true;
      throw new TypeError('Failed to fetch');
    });
    renderRoute('/trips/demo-lisbon');

    expect(await screen.findByRole('region', { name: /Day 1/ }, { timeout: 8000 })).toBeVisible();
    expect(batches(api).slice(0, 3)).toEqual([
      [0, 2],
      [2, 2],
      [2, 1],
    ]);
  }, 10_000);

  it('waits once for a single day, then asks the user to try again', async () => {
    const api = server((body) => body.firstDay === 4);
    renderRoute('/trips/demo-lisbon');

    expect(
      await screen.findByText('The AI or the map search is busy right now.', {}, { timeout: 8000 }),
    ).toBeVisible();
    await waitFor(() => {
      expect(batches(api)).toEqual([
        [0, 2],
        [2, 2],
        [4, 2],
        [4, 1],
        [4, 1],
      ]);
    });
  }, 10_000);
});
