import { useState, type SubmitEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDate, formatMoney } from '../../../lib/format';
import { allocation, buildRequest, defaultTitle, tripLength } from '../buildRequest';
import { FieldError, StepForm } from '../StepForm';
import { STEPS, type StepId } from '../wizardStore';
import type { StepProps } from './DestinationStep';

interface ReviewProps extends StepProps {
  onEdit: (step: number) => void;
  onCreate: (title: string) => void;
  creating: boolean;
  createError?: string | undefined;
}

function Row({
  label,
  step,
  onEdit,
  children,
}: {
  label: string;
  step: StepId;
  onEdit: (s: number) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <dt className="text-sm text-slate-600">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
      <button
        type="button"
        onClick={() => {
          onEdit(STEPS.indexOf(step));
        }}
        className="text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
        aria-label={t('wizard.review.editLabel', { section: label })}
      >
        {t('actions.edit')}
      </button>
    </div>
  );
}

export function ReviewStep({
  answers,
  onBack,
  onEdit,
  onCreate,
  creating,
  createError,
}: ReviewProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(answers.title || defaultTitle(answers));
  const [error, setError] = useState<string>();
  const days = allocation(answers);
  const length = tripLength(answers);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = buildRequest({ ...answers, title });
    if (!parsed.success) {
      setError(t('wizard.review.invalid'));
      return;
    }
    setError(undefined);
    onCreate(title);
  }

  const party = t(`wizard.travelers.party.${answers.party}`);
  const people =
    answers.party === 'family'
      ? t('wizard.review.people', { adults: answers.adults, children: answers.children })
      : party;
  return (
    <StepForm
      title={t('wizard.review.title')}
      hint={t('wizard.review.hint')}
      onSubmit={submit}
      onBack={onBack}
      nextLabel={creating ? t('wizard.review.creating') : t('wizard.review.create')}
      busy={creating}
    >
      <label className="block">
        <span className="font-medium">{t('wizard.review.tripTitle')}</span>
        <input
          value={title}
          maxLength={80}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">
        <Row label={t('wizard.review.where')} step="destination" onEdit={onEdit}>
          {answers.destinations
            .map((d, i) => `${d.name} (${t('wizard.review.dayCount', { count: days[i] ?? 0 })})`)
            .join(', ')}
        </Row>
        <Row label={t('wizard.review.when')} step="dates" onEdit={onEdit}>
          {answers.dateMode === 'dates' && answers.startDate
            ? `${formatDate(answers.startDate)} - ${formatDate(answers.endDate)}`
            : t('wizard.review.flexible', { count: length })}
        </Row>
        <Row label={t('wizard.review.who')} step="travelers" onEdit={onEdit}>
          {people}
        </Row>
        <Row label={t('wizard.review.budget')} step="budget" onEdit={onEdit}>
          {t(`wizard.budget.level.${answers.budgetLevel}`)}
          {answers.budgetAmount
            ? `, ${formatMoney(answers.budgetAmount, answers.currency)}`
            : ` (${answers.currency})`}
        </Row>
        <Row label={t('wizard.review.interests')} step="interests" onEdit={onEdit}>
          {answers.interests.map((i) => t(`interests.${i}`)).join(', ')}
        </Row>
        <Row label={t('wizard.review.pace')} step="pace" onEdit={onEdit}>
          {t(`pace.${answers.pace}`)}
        </Row>
        <Row label={t('wizard.review.constraints')} step="constraints" onEdit={onEdit}>
          {[
            answers.mobility !== 'none'
              ? t(`wizard.constraints.mobilityOption.${answers.mobility}`)
              : null,
            ...answers.dietary.map((d) => t(`dietary.${d}`)),
            ...answers.mustSee,
          ]
            .filter(Boolean)
            .join(', ') || t('wizard.review.none')}
        </Row>
      </dl>
      <p className="text-sm text-slate-600">{t('wizard.review.aiNote')}</p>
      <FieldError id="review-error" message={error ?? createError} />
    </StepForm>
  );
}
