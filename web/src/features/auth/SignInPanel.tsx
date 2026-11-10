import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { profileQuery } from '../../lib/queries';
import { signInWithGoogle, startDemo, type SessionUser } from '../../lib/session';

type Method = 'google' | 'demo';

function isCancelledPopup(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

export function SignInPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Method | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(method: Method, run: () => Promise<SessionUser>) {
    setPending(method);
    setError(null);
    try {
      const user = await run();
      // Creates the profile (and the demo's sample trips) before any signed-in page renders.
      await queryClient.query(profileQuery(user.uid));
      onSignedIn();
    } catch (caught) {
      setError(isCancelledPopup(caught) ? t('auth.errors.cancelled') : t('auth.errors.generic'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <Button size="lg" disabled={pending !== null} onClick={() => void signIn('demo', startDemo)}>
        {pending === 'demo' ? t('auth.preparingDemo') : t('auth.demo')}
      </Button>
      <p className="-mt-1 text-sm text-slate-600">{t('auth.demoHint')}</p>
      <Button
        size="lg"
        variant="secondary"
        disabled={pending !== null}
        onClick={() => void signIn('google', signInWithGoogle)}
      >
        {pending === 'google' ? t('auth.pending') : t('auth.google')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
