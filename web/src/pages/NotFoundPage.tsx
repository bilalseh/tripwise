import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{t('notFound.title')}</h1>
      <p className="mt-3 text-slate-600">{t('notFound.body')}</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
      >
        {t('notFound.home')}
      </Link>
    </div>
  );
}
