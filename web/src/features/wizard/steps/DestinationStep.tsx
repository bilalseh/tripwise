import type { PlaceResult } from '@tripwise/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/States';
import { placesApi } from '../../../lib/queries';
import { FieldError, StepForm } from '../StepForm';
import type { WizardAnswers } from '../wizardStore';

type Picked = WizardAnswers['destinations'][number];

function toDestination(result: PlaceResult): Picked {
  return {
    name: result.place.name,
    displayName: result.place.address,
    country: result.country ?? null,
    countryCode: result.countryCode ?? null,
    location: result.place.location,
  };
}

interface StepProps {
  answers: WizardAnswers;
  onNext: (patch: Partial<WizardAnswers>) => void;
  onBack?: () => void;
}

/** Destinations come from the geocoder, so every trip starts from real coordinates. */
export function DestinationStep({ answers, onNext }: StepProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked[]>(answers.destinations);
  const [error, setError] = useState<string>();
  const search = useMutation({ mutationFn: (q: string) => placesApi.search(q) });

  function runSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setError(t('wizard.destination.tooShort'));
      return;
    }
    setError(undefined);
    search.mutate(q);
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked.length) {
      setError(t('wizard.destination.required'));
      return;
    }
    const sameAsBefore = JSON.stringify(picked) === JSON.stringify(answers.destinations);
    onNext({ destinations: picked, ...(sameAsBefore ? {} : { daysPerDestination: [] }) });
  }

  const results = (search.data?.results ?? [])
    .filter((r) => r.kind === 'area')
    .concat((search.data?.results ?? []).filter((r) => r.kind === 'poi'));

  return (
    <StepForm
      title={t('wizard.destination.title')}
      hint={t('wizard.destination.hint')}
      onSubmit={submit}
    >
      <div>
        <label htmlFor="destination-search" className="block font-medium">
          {t('wizard.destination.label')}
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="destination-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runSearch();
              }
            }}
            aria-describedby="destination-error"
            aria-invalid={Boolean(error)}
            placeholder={t('wizard.destination.placeholder')}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
            disabled={picked.length >= 3}
          />
          <Button
            variant="secondary"
            onClick={runSearch}
            disabled={search.isPending || picked.length >= 3}
          >
            {search.isPending ? <Spinner className="size-4" /> : null}
            {t('wizard.destination.search')}
          </Button>
        </div>
        <FieldError id="destination-error" message={error} />
        {search.isError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {t('wizard.destination.failed')}
          </p>
        )}
      </div>

      {search.data && (
        <div aria-live="polite">
          {results.length === 0 ? (
            <p className="text-sm text-slate-600">{t('wizard.destination.noResults')}</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {results.slice(0, 6).map((result) => (
                <li key={`${result.place.osmId ?? result.place.name}-${result.place.location.lat}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked((list) => [...list, toDestination(result)].slice(0, 3));
                      search.reset();
                      setQuery('');
                    }}
                    className="w-full px-4 py-3 text-start hover:bg-slate-50"
                  >
                    <span className="block font-medium">{result.place.name}</span>
                    <span className="block text-sm text-slate-600">{result.place.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">{search.data.attribution}</p>
        </div>
      )}

      {picked.length > 0 && (
        <div>
          <h2 className="font-medium">
            {t('wizard.destination.picked', { count: picked.length })}
          </h2>
          <ol className="mt-2 flex flex-col gap-2">
            {picked.map((destination, index) => (
              <li
                key={`${destination.name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-2 ring-1 ring-slate-200"
              >
                <span>
                  <span className="font-medium">{destination.name}</span>
                  <span className="block text-sm text-slate-600">{destination.displayName}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('wizard.destination.remove', { name: destination.name })}
                  onClick={() => {
                    setPicked((list) => list.filter((_, i) => i !== index));
                  }}
                >
                  {t('actions.remove')}
                </Button>
              </li>
            ))}
          </ol>
          {picked.length >= 3 && (
            <p className="mt-2 text-sm text-slate-600">{t('wizard.destination.max')}</p>
          )}
        </div>
      )}
    </StepForm>
  );
}

export type { StepProps };
