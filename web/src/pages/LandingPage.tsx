import { useTranslation } from 'react-i18next';

const FEATURES = ['map', 'edit', 'essentials'] as const;

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <p className="inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-900">
            {t('landing.badge')}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {t('landing.title')}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-pretty text-slate-600">
            {t('landing.subtitle')}
          </p>
        </div>
      </section>
      <section aria-labelledby="features-heading" className="mx-auto max-w-5xl px-4 py-12">
        <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
          {t('landing.featuresHeading')}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((key, index) => (
            <li key={key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-accent-500 text-sm font-bold text-white"
              >
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold">{t(`landing.features.${key}.title`)}</h3>
              <p className="mt-1 text-sm text-slate-600">{t(`landing.features.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
