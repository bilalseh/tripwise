import type { AiEditProposal } from '@tripwise/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { fakeApi, FakeResponse } from '../../test/fakeApi';
import { DEMO_USER, fakeSession } from '../../test/fakeSession';
import { day, PROFILE, stop, trip } from '../../test/fixtures';
import { renderRoute } from '../../test/renderRoute';
import { useItineraryStore } from './itineraryStore';

const usage = {
  aiUsed: 0,
  aiLimit: 20,
  resetsAt: '2026-11-11T00:00:00Z',
  tier: 'free',
  trips: 2,
  tripLimit: 5,
};

function routes(extra: Record<string, (body: unknown) => unknown> = {}) {
  return fakeApi({
    'GET /health': () => ({ status: 'ok', version: 't' }),
    'POST /me': () => PROFILE,
    'GET /me/usage': () => usage,
    'GET /trips': () => [],
    'GET /trips/demo-lisbon': () => trip(),
    'GET /trips/demo-lisbon/weather': () => ({
      kind: 'unavailable',
      destinations: [],
      attribution: 'Open-Meteo',
    }),
    'PUT /trips/demo-lisbon': (body) => ({
      ...trip(),
      ...(body as object),
      version: (body as { baseVersion: number }).baseVersion + 1,
    }),
    ...extra,
  });
}

const names = (region: HTMLElement) =>
  within(region)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

describe('itinerary editing', () => {
  beforeEach(() => {
    fakeSession.setUser(DEMO_USER);
  });

  it('shows the day with real addresses, estimates and the grounding report', async () => {
    routes();
    renderRoute('/trips/demo-lisbon');

    const dayOne = await screen.findByRole('region', { name: /Day 1/ });
    expect(names(dayOne)).toEqual(['Belém Tower', 'Pastéis de Belém']);
    expect(within(dayOne).getByText('Belém Tower, Lisbon, Portugal')).toBeInTheDocument();
    expect(within(dayOne).getAllByText(/about €10\.00 \(estimate\)/)).toHaveLength(2);
    expect(within(dayOne).getByText(/straight-line estimate/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Invented Garden');
  });

  it('moves a stop to another day, undoes and redoes it, and autosaves with the version', async () => {
    const user = userEvent.setup();
    const api = routes();
    renderRoute('/trips/demo-lisbon');
    await screen.findByRole('region', { name: /Day 1/ });

    await user.selectOptions(screen.getByLabelText('Move Belém Tower to another day'), 'Day 2');
    expect(names(screen.getByRole('region', { name: /Day 1/ }))).toEqual(['Pastéis de Belém']);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(names(screen.getByRole('region', { name: /Day 1/ }))).toEqual([
      'Belém Tower',
      'Pastéis de Belém',
    ]);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(names(screen.getByRole('region', { name: /Day 1/ }))).toEqual(['Pastéis de Belém']);

    await waitFor(
      () => {
        expect(api.calls.some((c) => c.key === 'PUT /trips/demo-lisbon')).toBe(true);
      },
      { timeout: 3000 },
    );
    const saved = api.calls.find((c) => c.key === 'PUT /trips/demo-lisbon')?.body as {
      baseVersion: number;
      days: { stops: { id: string }[] }[];
    };
    expect(saved.baseVersion).toBe(3);
    expect(saved.days[1]?.stops.map((s) => s.id)).toEqual(['c', 'a']);
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('locks, notes and removes stops, each as one undo step', async () => {
    const user = userEvent.setup();
    routes();
    renderRoute('/trips/demo-lisbon');
    const dayOne = await screen.findByRole('region', { name: /Day 1/ });

    const tower = within(dayOne).getByRole('article', { name: 'Stop 1: Belém Tower' });
    await user.click(within(tower).getByRole('button', { name: 'Lock' }));
    expect(within(dayOne).getByText('Locked')).toBeInTheDocument();
    await user.click(within(dayOne).getByRole('button', { name: 'Remove Pastéis de Belém' }));
    expect(names(dayOne)).toEqual(['Belém Tower']);

    act(() => {
      useItineraryStore.getState().undo();
    });
    expect(names(screen.getByRole('region', { name: /Day 1/ }))).toEqual([
      'Belém Tower',
      'Pastéis de Belém',
    ]);
    expect(useItineraryStore.getState().history.past).toHaveLength(1);
  });

  it('tells the user when another tab saved first', async () => {
    const user = userEvent.setup();
    routes({
      'PUT /trips/demo-lisbon': () => {
        throw new FakeResponse(409, { detail: { code: 'stale_version' } });
      },
    });
    renderRoute('/trips/demo-lisbon');
    await screen.findByRole('region', { name: /Day 1/ });

    await user.click(screen.getByRole('button', { name: 'Remove Belém Tower' }));

    expect(
      await screen.findByText('This trip changed in another tab.', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('previews an AI edit as a diff and applies it as one undoable step', async () => {
    const user = userEvent.setup();
    const proposal: AiEditProposal = {
      action: 'relaxed',
      dayIndex: 0,
      day: day([
        stop('a', 'Belém Tower', { durationMinutes: 120 }),
        stop('n1', 'Jardim da Estrela'),
      ]),
      summary: 'Fewer stops and a long lunch.',
      report: { provider: 'fake', suggested: 1, kept: 2, dropped: [], trimmed: [], unchecked: [] },
    };
    const api = routes({ 'POST /trips/demo-lisbon/ai-edit': () => proposal });
    renderRoute('/trips/demo-lisbon');
    await screen.findByRole('region', { name: /Day 1/ });

    await user.selectOptions(screen.getByLabelText('Ask the AI to change day 1'), 'relaxed');
    const dialog = await screen.findByRole('dialog', { name: /Make it more relaxed: day 1/ });

    expect(within(dialog).getByText('Fewer stops and a long lunch.')).toBeInTheDocument();
    expect(within(dialog).getByText('Jardim da Estrela').closest('li')).toHaveTextContent('Added');
    expect(within(dialog).getByText('Pastéis de Belém').closest('li')).toHaveTextContent('Removed');
    expect(within(dialog).getByText('Belém Tower').closest('li')).toHaveTextContent('Changed');
    const sent = api.calls.find((c) => c.key === 'POST /trips/demo-lisbon/ai-edit')?.body as {
      day: { stops: unknown[] };
    };
    expect(sent.day.stops).toHaveLength(2);

    await user.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    expect(names(screen.getByRole('region', { name: /Day 1/ }))).toEqual([
      'Belém Tower',
      'Jardim da Estrela',
    ]);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(names(screen.getByRole('region', { name: /Day 1/ }))).toEqual([
      'Belém Tower',
      'Pastéis de Belém',
    ]);
  });

  it('explains the daily AI limit', async () => {
    const user = userEvent.setup();
    routes({
      'POST /trips/demo-lisbon/ai-edit': () => {
        throw new FakeResponse(429, { detail: { code: 'ai_limit_reached' } });
      },
    });
    renderRoute('/trips/demo-lisbon');
    await screen.findByRole('region', { name: /Day 1/ });

    await user.selectOptions(screen.getByLabelText('Ask the AI to change day 1'), 'cheaper');

    expect(await screen.findByText(/used today's AI requests/)).toBeInTheDocument();
  });
});
