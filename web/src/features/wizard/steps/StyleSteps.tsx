import type { Dietary, Interest, Mobility, Pace } from '@tripwise/shared';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceCard, FieldError, StepForm } from '../StepForm';
import type { StepProps } from './DestinationStep';

const INTERESTS: Interest[] = [
  'food',
  'history',
  'art',
  'nature',
  'nightlife',
  'shopping',
  'relaxation',
  'adventure',
];
const PACES: Pace[] = ['relaxed', 'balanced', 'packed'];
const MOBILITY: Mobility[] = ['none', 'limited', 'wheelchair'];
const DIETARY: Dietary[] = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free'];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function InterestsStep({ answers, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const [interests, setInterests] = useState(answers.interests);
  const [error, setError] = useState<string>();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interests.length) {
      setError(t('wizard.interests.required'));
      return;
    }
    onNext({ interests });
  }

  return (
    <StepForm
      title={t('wizard.interests.title')}
      hint={t('wizard.interests.hint')}
      onSubmit={submit}
      onBack={onBack}
    >
      <fieldset aria-describedby="interests-error">
        <legend className="sr-only">{t('wizard.interests.title')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {INTERESTS.map((value) => (
            <ChoiceCard
              key={value}
              type="checkbox"
              name="interests"
              value={value}
              checked={interests.includes(value)}
              onChange={() => {
                setInterests((list) => toggle(list, value));
              }}
              title={t(`interests.${value}`)}
            />
          ))}
        </div>
      </fieldset>
      <FieldError id="interests-error" message={error} />
    </StepForm>
  );
}

export function PaceStep({ answers, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const [pace, setPace] = useState(answers.pace);
  return (
    <StepForm
      title={t('wizard.pace.title')}
      onBack={onBack}
      onSubmit={(event) => {
        event.preventDefault();
        onNext({ pace });
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t('wizard.pace.title')}</legend>
        {PACES.map((value) => (
          <ChoiceCard
            key={value}
            name="pace"
            value={value}
            checked={pace === value}
            onChange={() => {
              setPace(value);
            }}
            title={t(`pace.${value}`)}
            body={t(`wizard.pace.hint.${value}`)}
          />
        ))}
      </fieldset>
    </StepForm>
  );
}

export function ConstraintsStep({ answers, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const [mobility, setMobility] = useState(answers.mobility);
  const [dietary, setDietary] = useState(answers.dietary);
  const [mustSee, setMustSee] = useState(answers.mustSee.join('\n'));
  const [notes, setNotes] = useState(answers.notes);
  const [error, setError] = useState<string>();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const places = mustSee
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (places.length > 10) {
      setError(t('wizard.constraints.tooMany'));
      return;
    }
    if (places.some((p) => p.length > 120) || notes.length > 500) {
      setError(t('wizard.constraints.tooLong'));
      return;
    }
    onNext({ mobility, dietary, mustSee: [...new Set(places)], notes });
  }

  return (
    <StepForm
      title={t('wizard.constraints.title')}
      hint={t('wizard.constraints.hint')}
      onSubmit={submit}
      onBack={onBack}
    >
      <fieldset>
        <legend className="font-medium">{t('wizard.constraints.mobility')}</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {MOBILITY.map((value) => (
            <ChoiceCard
              key={value}
              name="mobility"
              value={value}
              checked={mobility === value}
              onChange={() => {
                setMobility(value);
              }}
              title={t(`wizard.constraints.mobilityOption.${value}`)}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-medium">{t('wizard.constraints.dietary')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIETARY.map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${dietary.includes(value) ? 'border-brand-600 bg-brand-50 font-semibold' : 'border-slate-300 bg-white'}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={dietary.includes(value)}
                onChange={() => {
                  setDietary((list) => toggle(list, value));
                }}
              />
              {t(`dietary.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="font-medium">{t('wizard.constraints.mustSee')}</span>
        <textarea
          value={mustSee}
          onChange={(e) => {
            setMustSee(e.target.value);
          }}
          rows={3}
          placeholder={t('wizard.constraints.mustSeePlaceholder')}
          aria-describedby="constraints-error"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="font-medium">{t('wizard.constraints.notes')}</span>
        <textarea
          value={notes}
          maxLength={500}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <FieldError id="constraints-error" message={error} />
    </StepForm>
  );
}
