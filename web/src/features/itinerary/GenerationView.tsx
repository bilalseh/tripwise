import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '../../components/Button';
import { buttonClass } from '../../components/buttonClass';
import { Spinner } from '../../components/States';
import type { Generation } from './useGeneration';

export function GenerationView({ generation }: { generation: Generation }) {
  const { t } = useTranslation();
  const { running, done, total, error, resetsAt } = generation;
  const percent = total ? Math.round((done / total) * 100) : 0;

  if (error) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center"
      >
        <p className="font-semibold text-amber-900">{t(`generate.error.${error}`)}</p>
        {error === 'limit' && resetsAt && (
          <p className="mt-1 text-sm text-amber-900">
            {t('generate.resets', { time: new Date(resetsAt).toLocaleTimeString() })}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {error !== 'limit' && (
            <Button
              onClick={() => {
                generation.start();
              }}
            >
              {t('generate.retry')}
            </Button>
          )}
          {error === 'limit' && (
            <Link to="/pricing" className={buttonClass('secondary')}>
              {t('generate.seePlans')}
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div role="status" className="flex flex-col items-center gap-3">
        {running && <Spinner className="size-8 text-brand-600" />}
        <p className="text-lg font-semibold">{t('generate.title')}</p>
        <p className="text-sm text-slate-600">{t('generate.progress', { done, total })}</p>
      </div>
      <div
        role="progressbar"
        aria-label={t('generate.title')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full bg-brand-600 transition-all"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <ol className="mt-6 space-y-1 text-start text-sm text-slate-600">
        <li>{t('generate.step1')}</li>
        <li>{t('generate.step2')}</li>
        <li>{t('generate.step3')}</li>
      </ol>
    </div>
  );
}
