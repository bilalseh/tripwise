import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { buttonClass } from '../components/buttonClass';
import { SignInPanel } from '../features/auth/SignInPanel';
import { useAuthUser } from '../features/auth/useAuthUser';

const FEATURES = ['map', 'edit', 'essentials'] as const;
const STEPS = ['wizard', 'plan', 'tweak'] as const;

export function LandingPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const navigate = useNavigate();

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-14 sm:py-20 md:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              {t('landing.title')}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-pretty text-slate-600">
              {t('landing.subtitle')}
            </p>
            <p className="mt-4 text-sm text-slate-500">{t('landing.planningOnly')}</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            {user ? (
              <Link to="/trips" className={`${buttonClass('primary', 'lg')} w-full`}>
                {t('landing.openTrips')}
              </Link>
            ) : (
              <SignInPanel onSignedIn={() => void navigate('/trips')} />
            )}
          </div>
        </div>
      </section>
      <section aria-labelledby="how-heading" className="mx-auto max-w-5xl px-4 py-12">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
          {t('landing.howHeading')}
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((key, index) => (
            <li key={key} className="rounded-xl border border-slate-200 bg-white p-5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-accent-500 text-sm font-bold text-white"
              >
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold">{t(`landing.steps.${key}.title`)}</h3>
              <p className="mt-1 text-sm text-slate-600">{t(`landing.steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="features-heading" className="mx-auto max-w-5xl px-4 pb-16">
        <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
          {t('landing.featuresHeading')}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((key) => (
            <li key={key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold">{t(`landing.features.${key}.title`)}</h3>
              <p className="mt-1 text-sm text-slate-600">{t(`landing.features.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
