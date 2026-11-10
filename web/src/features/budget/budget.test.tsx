import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { fakeApi } from '../../test/fakeApi';
import { DEMO_USER, fakeSession } from '../../test/fakeSession';
import { PROFILE, trip } from '../../test/fixtures';
import { renderRoute } from '../../test/renderRoute';

describe('budget', () => {
  beforeEach(() => {
    fakeSession.setUser(DEMO_USER);
    fakeApi({
      'GET /health': () => ({ status: 'ok', version: 't' }),
      'POST /me': () => PROFILE,
      'GET /me/usage': () => ({
        aiUsed: 0,
        aiLimit: 20,
        resetsAt: '2026-11-11T00:00:00Z',
        tier: 'free',
        trips: 2,
        tripLimit: 5,
      }),
      'GET /trips/demo-lisbon': () => trip(),
      'PUT /trips/demo-lisbon': (body) => ({ ...trip(), ...(body as object), version: 4 }),
    });
  });

  it('totals the estimates and compares them with the wizard budget', async () => {
    renderRoute('/trips/demo-lisbon/budget');

    const meter = await screen.findByRole('meter', { name: 'Estimated total against your budget' });
    // 2 days x (100 stay + 40 food + 5 transport) + 30 of stops = 320 of 500.
    expect(meter).toHaveAttribute('aria-valuenow', '320');
    expect(screen.getByText(/64% of your €500 budget/)).toBeInTheDocument();
  });

  it('lets the user override an estimate with their own number', async () => {
    const user = userEvent.setup();
    renderRoute('/trips/demo-lisbon/budget');

    const cell = await screen.findByLabelText('Stay on day 1');
    await user.type(cell, '400{Enter}');

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '500');
    expect(screen.getByText(/€120 over your €500 budget/)).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Day 1/ });
    expect(within(row).getByText('your number')).toBeInTheDocument();
  });
});
