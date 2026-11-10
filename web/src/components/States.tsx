import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-e-transparent ${className}`}
    />
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-600">
      <Spinner />
      <span>{label ?? t('states.loading')}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-center"
    >
      <p className="font-semibold text-red-900">{t('states.errorTitle')}</p>
      <p className="mt-1 text-sm text-red-900">{message ?? t('states.errorBody')}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          {t('states.retry')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-semibold text-slate-900">{title}</p>
      {body && <p className="mt-1 text-sm text-slate-600">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
