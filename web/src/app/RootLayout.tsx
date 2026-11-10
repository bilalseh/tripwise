import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';

import { ApiStatusBadge } from '../features/status/ApiStatusBadge';
import { currentLanguage } from '../i18n';

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const nextLanguage = currentLanguage() === 'ar' ? 'en' : 'ar';

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <a
        href="#main"
        className="sr-only rounded-md bg-white px-3 py-2 focus:not-sr-only focus:absolute focus:start-4 focus:top-4"
      >
        {t('nav.skipToContent')}
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            aria-label={t('app.home')}
            className="text-lg font-bold tracking-tight text-brand-700"
          >
            {t('app.name')}
          </Link>
          <button
            type="button"
            lang={nextLanguage}
            aria-label={t('nav.switchLanguageLabel')}
            onClick={() => void i18n.changeLanguage(nextLanguage)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {t('nav.switchLanguage')}
          </button>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <ApiStatusBadge />
        </div>
      </footer>
    </div>
  );
}
