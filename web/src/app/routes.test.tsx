import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { fakeSession, DEMO_USER } from '../test/fakeSession';
import { fakeApi } from '../test/fakeApi';
import { PROFILE } from '../test/fixtures';
import { renderRoute } from '../test/renderRoute';

const health = () => ({ status: 'ok', version: 'abc1234' });

describe('app shell', () => {
  it('renders the landing page with the demo button', async () => {
    fakeApi({ 'GET /health': health });
    renderRoute('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Plan a trip in minutes' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument();
    expect(await screen.findByText('API online (version abc1234)')).toBeInTheDocument();
  });

  it('starts the demo: anonymous sign-in, seeded profile, then the trips page', async () => {
    const api = fakeApi({
      'GET /health': health,
      'POST /me': () => PROFILE,
      'GET /trips': () => [],
      'GET /me/usage': () => ({
        aiUsed: 0,
        aiLimit: 20,
        resetsAt: '2026-11-11T00:00:00Z',
        tier: 'free',
        trips: 2,
        tripLimit: 5,
      }),
    });
    const { router } = renderRoute('/');

    await userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/trips');
    });
    expect(api.calls.some((c) => c.key === 'POST /me')).toBe(true);
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument();
  });

  it('sends signed-out visitors to sign in, keeping where they were going', async () => {
    fakeApi({ 'GET /health': health });
    const { router } = renderRoute('/trips/abc');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sign-in');
    });
    expect(router.state.location.search).toBe('?next=%2Ftrips%2Fabc');
  });

  it('shows a not-found page for unknown paths', () => {
    fakeApi({ 'GET /health': health });
    renderRoute('/no/such/page');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('switches to Arabic with a right-to-left layout', async () => {
    fakeApi({ 'GET /health': health });
    renderRoute('/');

    await userEvent.click(screen.getByRole('button', { name: /Switch to Arabic/ }));

    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
  });

  it('applies the saved language of a signed-in user', async () => {
    fakeSession.setUser(DEMO_USER);
    fakeApi({
      'GET /health': health,
      'POST /me': () => ({ ...PROFILE, preferences: { ...PROFILE.preferences, language: 'ar' } }),
      'GET /trips': () => [],
      'GET /me/usage': () => ({
        aiUsed: 0,
        aiLimit: 20,
        resetsAt: '2026-11-11T00:00:00Z',
        tier: 'free',
        trips: 0,
        tripLimit: 5,
      }),
    });
    renderRoute('/trips');

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    });
  });
});
