import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@tripwise/shared';
import { useTranslation } from 'react-i18next';

import { apiGet } from '../../lib/apiClient';

const healthQuery = {
  queryKey: ['health'],
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<HealthResponse>('/health', { signal }),
} as const;

/** Shows whether the API answers through the `/api` rewrite; proves the deploy is wired. */
export function ApiStatusBadge() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useQuery(healthQuery);

  const [dotClass, label] = isPending
    ? ['bg-slate-400', t('status.checking')]
    : isError
      ? ['bg-red-500', t('status.offline')]
      : ['bg-emerald-500', t('status.online', { version: data.version })];

  return (
    <p role="status" className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span aria-hidden="true" className={`size-2 rounded-full ${dotClass}`} />
      {label}
    </p>
  );
}
