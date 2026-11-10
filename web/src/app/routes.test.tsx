import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderRoute } from '../test/renderRoute';

function stubHealth(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const healthy = () =>
  new Response(JSON.stringify({ status: 'ok', version: 'abc1234' }), {
    headers: { 'Content-Type': 'application/json' },
  });

describe('app shell', () => {
  it('renders the landing page with its features', async () => {
    stubHealth(healthy());
    renderRoute('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Plan a trip in minutes' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(await screen.findByText('API online (version abc1234)')).toBeInTheDocument();
  });

  it('calls the same-origin health endpoint', async () => {
    const fetchMock = stubHealth(healthy());
    renderRoute('/');

    await screen.findByText(/API online/);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('reports an unreachable API', async () => {
    stubHealth(new Response('nope', { status: 502 }));
    renderRoute('/');

    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });

  it('shows a not-found page for unknown paths', () => {
    stubHealth(healthy());
    renderRoute('/no/such/page');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('switches to Arabic with a right-to-left layout', async () => {
    stubHealth(healthy());
    renderRoute('/');

    await userEvent.click(screen.getByRole('button', { name: 'Switch to Arabic' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('خطّط لرحلتك في دقائق');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
  });
});
