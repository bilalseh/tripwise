export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  signal?: AbortSignal | undefined;
}

/** GETs from the Tripwise API, served same-origin under `/api` (a Hosting rewrite in prod). */
export async function apiGet<T>(path: `/${string}`, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { Accept: 'application/json' },
    signal: options.signal ?? null,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(response.status, `GET /api${path} failed (${response.status})`, body);
  }
  return (await response.json()) as T;
}
