import type { Profile } from '@tripwise/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';

import { useAuthUser } from '../features/auth/useAuthUser';
import { ApiStatusBadge } from '../features/status/ApiStatusBadge';
import { useWizardStore } from '../features/wizard/wizardStore';
import { currentLanguage, type AppLanguage } from '../i18n';
import { accountApi, keys } from '../lib/queries';
import { signOut } from '../lib/session';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-900' : 'text-slate-700 hover:bg-slate-100'}`;

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const user = useAuthUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const nextLanguage: AppLanguage = currentLanguage() === 'ar' ? 'en' : 'ar';

  /** Switch language; for a signed-in user it is also saved, so it follows them around. */
  async function switchLanguage() {
    await i18n.changeLanguage(nextLanguage);
    const profile = user ? queryClient.getQueryData<Profile>(keys.profile(user.uid)) : undefined;
    if (!user || !profile) return;
    const preferences = { ...profile.preferences, language: nextLanguage };
    queryClient.setQueryData<Profile>(keys.profile(user.uid), { ...profile, preferences });
    await accountApi.savePreferences(preferences).catch(() => undefined);
  }

  async function handleSignOut() {
    await signOut();
    queryClient.clear();
    useWizardStore.getState().reset();
    await navigate('/');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <a
        href="#main"
        className="sr-only rounded-md bg-white px-3 py-2 focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50"
      >
        {t('nav.skipToContent')}
      </a>
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <Link
            to={user ? '/trips' : '/'}
            aria-label={t('app.home')}
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-brand-700"
          >
            <img src="/favicon.svg" alt="" className="size-7" />
            {t('app.name')}
          </Link>
          <nav aria-label={t('nav.main')} className="flex flex-wrap items-center gap-1">
            {user && (
              <NavLink to="/trips" className={navClass}>
                {t('nav.trips')}
              </NavLink>
            )}
            <NavLink to="/pricing" className={navClass}>
              {t('nav.pricing')}
            </NavLink>
            {user && (
              <NavLink to="/settings" className={navClass}>
                {t('nav.settings')}
              </NavLink>
            )}
            <button
              type="button"
              lang={nextLanguage}
              onClick={() => void switchLanguage()}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <span className="sr-only">{t('nav.switchLanguageLabel')}: </span>
              {t('nav.switchLanguage')}
            </button>
            {user ? (
              <>
                {user.isAnonymous && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    {t('auth.demoBadge')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t('auth.signOut')}
                </button>
              </>
            ) : (
              <NavLink to="/sign-in" className={navClass}>
                {t('auth.signIn')}
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500">
          <p>{t('footer.planningOnly')}</p>
          <p>{t('footer.data')}</p>
          <ApiStatusBadge />
        </div>
      </footer>
    </div>
  );
}
