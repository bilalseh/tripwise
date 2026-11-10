import { getIdToken } from './session';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** The `detail.code` the API puts on its errors, for example "ai_limit_reached". */
  get code(): string | null {
    const detail = (this.body as { detail?: { code?: unknown } } | null)?.detail;
    return typeof detail?.code === 'string' ? detail.code : null;
  }

  get detail(): Record<string, unknown> {
    const detail = (this.body as { detail?: unknown } | null)?.detail;
    return detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {};
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal | undefined;
  /** Public endpoints (share links) are called without a token. */
  anonymous?: boolean;
}

/** Calls the Tripwise API, served same-origin under `/api`, with the user's ID token. */
async function request<T>(method: Method, path: `/${string}`, options: RequestOptions = {}) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = options.anonymous ? null : await getIdToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: options.body === undefined ? null : JSON.stringify(options.body),
    signal: options.signal ?? null,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(response.status, `${method} /api${path} failed (${response.status})`, body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: `/${string}`, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: `/${string}`, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: `/${string}`, body: unknown) => request<T>('PUT', path, { body }),
  delete: (path: `/${string}`) => request<undefined>('DELETE', path),
};

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}
