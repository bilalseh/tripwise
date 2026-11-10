import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { safeNext } from '../../lib/safeRedirect';
import { SignInPanel } from './SignInPanel';
import { useAuthUser } from './useAuthUser';

export function SignInPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthUser();
  const next = safeNext(params.get('next'));

  if (user) return <Navigate to={next} replace />;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{t('auth.title')}</h1>
      <p className="mt-3 mb-8 text-slate-600">{t('auth.subtitle')}</p>
      <SignInPanel onSignedIn={() => void navigate(next, { replace: true })} />
    </div>
  );
}
