import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';

import { LoadingState } from '../../components/States';
import i18n, { isAppLanguage } from '../../i18n';
import { profileQuery } from '../../lib/queries';
import { waitForAuth, type SessionUser } from '../../lib/session';
import { useAuthUser } from './useAuthUser';

/** Gate for signed-in pages: waits for Firebase to restore the session, then for the profile
 * (which also seeds a demo account), and applies the user's saved language. */
export function RequireAuth() {
  const { t } = useTranslation();
  const location = useLocation();
  const live = useAuthUser();
  const [restored, setRestored] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void waitForAuth().then((user) => {
      if (active) setRestored(user);
    });
    return () => {
      active = false;
    };
  }, []);

  const user = live ?? restored;
  const profile = useQuery({ ...profileQuery(user?.uid ?? ''), enabled: Boolean(user) });
  const language = profile.data?.preferences.language;

  useEffect(() => {
    if (language && isAppLanguage(language) && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  if (restored === undefined && !live) return <LoadingState label={t('auth.restoring')} />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  if (profile.isPending) return <LoadingState label={t('auth.preparing')} />;
  return <Outlet />;
}
