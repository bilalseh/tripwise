import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { fakeApi } from '../../test/fakeApi';
import { DEMO_USER, fakeSession } from '../../test/fakeSession';
import { PROFILE, trip } from '../../test/fixtures';
import { renderRoute } from '../../test/renderRoute';
import { allocation, buildRequest, splitDays } from './buildRequest';
import { initialAnswers } from './wizardStore';

const LISBON = {
  place: {
    name: 'Lisbon',
    address: 'Lisbon, Portugal',
    location: { lat: 38.72, lng: -9.14 },
    osmId: 'R1',
    source: 'photon',
  },
  kind: 'area',
  country: 'Portugal',
  countryCode: 'pt',
};

describe('wizard helpers', () => {
  it('splits days evenly, earlier stops getting the extra day', () => {
    expect(splitDays(7, 3)).toEqual([3, 2, 2]);
  });

  it('uses the user split only when it adds up', () => {
    const answers = {
      ...initialAnswers(),
      destinations: [LISBON, LISBON].map(() => ({
        name: 'A',
        displayName: 'A',
        country: null,
        countryCode: null,
        location: { lat: 0, lng: 0 },
      })),
      dateMode: 'days' as const,
      totalDays: 5,
    };
    expect(allocation({ ...answers, daysPerDestination: [4, 1] })).toEqual([4, 1]);
    expect(allocation({ ...answers, daysPerDestination: [4, 4] })).toEqual([3, 2]);
  });

  it('builds a request the API schema accepts, or reports why not', () => {
    expect(buildRequest(initialAnswers()).success).toBe(false); // no destination, no interests
  });
});

describe('trip wizard', () => {
  beforeEach(() => {
    fakeSession.setUser(DEMO_USER);
  });

  it('walks through every question, keeps answers on Back, and creates the trip', async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      'GET /health': () => ({ status: 'ok', version: 't' }),
      'POST /me': () => PROFILE,
      'GET /places/search': () => ({ results: [LISBON], attribution: 'OSM' }),
      'POST /trips': () => trip({ id: 'new-trip', status: 'draft', days: [] }),
      'GET /trips/new-trip': () => trip({ id: 'new-trip' }),
      'GET /trips': () => [],
      'GET /me/usage': () => ({
        aiUsed: 0,
        aiLimit: 20,
        resetsAt: '2026-11-11T00:00:00Z',
        tier: 'free',
        trips: 1,
        tripLimit: 5,
      }),
      'GET /trips/new-trip/weather': () => ({
        kind: 'unavailable',
        destinations: [],
        attribution: 'x',
      }),
    });
    const { router } = renderRoute('/trips/new');

    // 1. Destination: nothing picked is an inline error; search then pick.
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one destination');
    await user.type(screen.getByLabelText('Destination'), 'Lisbon');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByRole('button', { name: /Lisbon, Portugal/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // 2. Dates: switch to a number of days.
    await user.click(screen.getByLabelText(/Number of days/, { selector: 'input[type=radio]' }));
    const days = screen.getByRole('spinbutton', { name: 'Number of days' });
    await user.clear(days);
    await user.type(days, '3');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // 3. Travellers, then Back: the answer is still there.
    await user.click(screen.getByLabelText(/Solo/));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText(/Solo/)).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // 4-7. Budget, interests (required), pace, constraints.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one interest');
    await user.click(screen.getByLabelText('Food'));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByLabelText(/Relaxed/));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByLabelText('Must-see places'), 'Belém Tower');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // 8. Review shows the answers, then create.
    expect(screen.getByRole('heading', { name: 'Review your trip' })).toBeInTheDocument();
    expect(screen.getByText('Lisbon (3 days)')).toBeInTheDocument();
    expect(screen.getByText('Belém Tower')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Build my plan' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/trips/new-trip');
    });
    const created = api.calls.find((c) => c.key === 'POST /trips')?.body as {
      title: string;
      request: Record<string, unknown>;
    };
    expect(created.title).toBe('Lisbon');
    expect(created.request).toMatchObject({
      pace: 'relaxed',
      interests: ['food'],
      startDate: null,
      travelers: { party: 'solo', adults: 1, children: 0 },
      currency: 'EUR',
    });
    expect((created.request['constraints'] as { mustSee: string[] }).mustSee).toEqual([
      'Belém Tower',
    ]);
  });

  it('shows the progress through the steps', async () => {
    fakeApi({ 'GET /health': () => ({ status: 'ok', version: 't' }), 'POST /me': () => PROFILE });
    renderRoute('/trips/new');

    expect(await screen.findByText('Step 1 of 8')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Trip wizard progress' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });
});
