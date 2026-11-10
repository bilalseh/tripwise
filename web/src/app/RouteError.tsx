import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router';

/** Last-resort screen when a route throws while rendering or loading. */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);

  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{t('error.title')}</h1>
      <p className="mt-3 text-slate-600">{t('error.body')}</p>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
      >
        {t('error.reload')}
      </button>
    </main>
  );
}
