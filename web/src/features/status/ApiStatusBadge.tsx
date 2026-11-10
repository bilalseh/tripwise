import type { HealthResponse } from '@tripwise/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api } from '../../lib/apiClient';

const healthQuery = {
  queryKey: ['health'],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    api.get<HealthResponse>('/health', { signal, anonymous: true }),
} as const;

/** Shows whether the API answers through the `/api` rewrite. */
export function ApiStatusBadge() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useQuery(healthQuery);

  const [dotClass, label] = isPending
    ? ['bg-slate-400', t('status.checking')]
    : isError
      ? ['bg-red-500', t('status.offline')]
      : ['bg-emerald-500', t('status.online', { version: data.version })];

  return (
    <p role="status" className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`size-2 rounded-full ${dotClass}`} />
      {label}
    </p>
  );
}
