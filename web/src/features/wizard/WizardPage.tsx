import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { isApiError } from '../../lib/apiClient';
import { keys, profileQuery, tripApi } from '../../lib/queries';
import { useUid } from '../auth/useUid';
import { buildRequest } from './buildRequest';
import { DatesStep } from './steps/DatesStep';
import { DestinationStep } from './steps/DestinationStep';
import { BudgetStep, TravelersStep } from './steps/PeopleSteps';
import { ReviewStep } from './steps/ReviewStep';
import { ConstraintsStep, InterestsStep, PaceStep } from './steps/StyleSteps';
import { STEPS, useWizardStore, type WizardAnswers } from './wizardStore';

export function WizardPage() {
  const { t } = useTranslation();
  const uid = useUid();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useQuery(profileQuery(uid));
  const { step, answers, update, goTo, reset } = useWizardStore();
  const container = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Start a fresh wizard in the user's home currency, unless one is in progress.
  const home = profile.data?.preferences.homeCurrency;
  useEffect(() => {
    if (home && step === 0 && !answers.destinations.length) update({ currency: home });
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus to the new question, so screen readers announce it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    container.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus();
  }, [step]);

  const create = useMutation({
    mutationFn: (title: string) => {
      const parsed = buildRequest({ ...answers, title });
      if (!parsed.success) throw new Error('invalid');
      return tripApi.create(parsed.data);
    },
    onSuccess: async (trip) => {
      await queryClient.invalidateQueries({ queryKey: keys.trips(uid) });
      await queryClient.invalidateQueries({ queryKey: keys.usage(uid) });
      reset(home);
      await navigate(`/trips/${trip.id}`);
    },
  });

  const next = (patch: Partial<WizardAnswers>) => {
    update(patch);
    goTo(step + 1);
  };
  const back = () => {
    goTo(step - 1);
  };
  const props = { answers, onNext: next, onBack: back };
  const id = STEPS[step] ?? 'destination';
  const createError = create.error
    ? isApiError(create.error) && create.error.code === 'trip_limit_reached'
      ? t('wizard.review.limit')
      : t('wizard.review.failed')
    : undefined;

  return (
    <div ref={container} className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <div className="flex justify-between text-sm text-slate-600">
          <span>{t('wizard.progress', { step: step + 1, total: STEPS.length })}</span>
          <span>{t(`wizard.stepName.${id}`)}</span>
        </div>
        <div
          role="progressbar"
          aria-label={t('wizard.progressLabel')}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${String(((step + 1) / STEPS.length) * 100)}%` }}
          />
        </div>
      </div>
      {id === 'destination' && <DestinationStep {...props} />}
      {id === 'dates' && <DatesStep {...props} />}
      {id === 'travelers' && <TravelersStep {...props} />}
      {id === 'budget' && <BudgetStep {...props} />}
      {id === 'interests' && <InterestsStep {...props} />}
      {id === 'pace' && <PaceStep {...props} />}
      {id === 'constraints' && <ConstraintsStep {...props} />}
      {id === 'review' && (
        <ReviewStep
          {...props}
          onEdit={goTo}
          onCreate={(title) => {
            create.mutate(title);
          }}
          creating={create.isPending}
          createError={createError}
        />
      )}
    </div>
  );
}
