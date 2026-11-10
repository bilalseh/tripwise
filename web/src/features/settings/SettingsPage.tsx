import type { Preferences, Profile } from '@tripwise/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { Button } from '../../components/Button';
import { LoadingState } from '../../components/States';
import i18n from '../../i18n';
import { CURRENCIES } from '../../lib/currencies';
import { accountApi, keys, profileQuery } from '../../lib/queries';
import { useAuthUser } from '../auth/useAuthUser';
import { useUid } from '../auth/useUid';
import { CheckoutReturn } from './CheckoutReturn';
import { DeleteAccountSection } from './DeleteAccountSection';
import { PlanSection } from './PlanSection';

export function SettingsPage() {
  const { t } = useTranslation();
  const uid = useUid();
  const user = useAuthUser();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const profile = useQuery(profileQuery(uid));
  const [draft, setDraft] = useState<Preferences | null>(null);
  const save = useMutation({
    mutationFn: accountApi.savePreferences,
    onSuccess: (saved: Profile) => {
      queryClient.setQueryData(keys.profile(uid), saved);
      void i18n.changeLanguage(saved.preferences.language);
      setDraft(null);
    },
  });

  if (!profile.data) return <LoadingState />;
  const prefs = draft ?? profile.data.preferences;
  const set = (patch: Partial<Preferences>) => {
    setDraft({ ...prefs, ...patch });
  };
  const sessionId = params.get('checkout');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
      {sessionId?.startsWith('cs_') && <CheckoutReturn uid={uid} sessionId={sessionId} />}

      <section
        aria-labelledby="profile-title"
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 id="profile-title" className="text-lg font-semibold">
          {t('settings.profile')}
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-slate-600">{t('settings.name')}</dt>
          <dd>{user?.isAnonymous ? t('auth.demoName') : (profile.data.displayName ?? '-')}</dd>
          <dt className="text-slate-600">{t('settings.email')}</dt>
          <dd dir="ltr" className="text-start">
            {profile.data.email ?? '-'}
          </dd>
        </dl>
      </section>

      <form
        aria-labelledby="prefs-title"
        className="rounded-xl border border-slate-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(prefs);
        }}
      >
        <h2 id="prefs-title" className="text-lg font-semibold">
          {t('settings.preferences')}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium">{t('settings.language')}</span>
            <select
              value={prefs.language}
              onChange={(e) => {
                set({ language: e.target.value as Preferences['language'] });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2"
            >
              <option value="en" lang="en">
                English
              </option>
              <option value="ar" lang="ar">
                العربية
              </option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t('settings.homeCurrency')}</span>
            <select
              value={prefs.homeCurrency}
              onChange={(e) => {
                set({ homeCurrency: e.target.value });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">{t('settings.units')}</span>
            <select
              value={prefs.units}
              onChange={(e) => {
                set({ units: e.target.value as Preferences['units'] });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2"
            >
              <option value="metric">{t('settings.metric')}</option>
              <option value="imperial">{t('settings.imperial')}</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t('settings.currencyHint')}</p>
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={!draft || save.isPending}>
            {t('actions.save')}
          </Button>
          {save.isSuccess && (
            <span role="status" className="text-sm text-emerald-700">
              {t('settings.saved')}
            </span>
          )}
          {save.isError && (
            <span role="alert" className="text-sm text-red-700">
              {t('edit.saveFailed')}
            </span>
          )}
        </div>
      </form>

      <PlanSection uid={uid} />
      <DeleteAccountSection />
    </div>
  );
}
