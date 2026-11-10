import { vi } from 'vitest';

type Handler = (body: unknown, url: URL) => unknown;

/**
 * Routes fetch calls to handlers keyed "METHOD /path" (path without /api, no query).
 * A handler's return value becomes the JSON body; throw a FakeResponse for errors.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = input instanceof Request ? input.url : input.toString();
    const url = new URL(href, 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname.replace(/^\/api/, '')}`;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ key, body });
    const handler = routes[key];
    if (!handler)
      return new Response(JSON.stringify({ detail: `no fake for ${key}` }), { status: 404 });
    try {
      const result = await handler(body, url);
      if (result === undefined) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      if (error instanceof FakeResponse) {
        return new Response(JSON.stringify(error.body), { status: error.status });
      }
      throw error;
    }
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export class FakeResponse extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown = null) {
    super(`HTTP ${String(status)}`);
    this.status = status;
    this.body = body;
  }
}
