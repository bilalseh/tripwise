import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { todayIso } from '../../../lib/format';
import { allocation, daysBetween, MAX_DAYS } from '../buildRequest';
import { ChoiceCard, FieldError, StepForm } from '../StepForm';
import type { StepProps } from './DestinationStep';

export function DatesStep({ answers, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(answers.dateMode);
  const [start, setStart] = useState(answers.startDate);
  const [end, setEnd] = useState(answers.endDate);
  const [total, setTotal] = useState(answers.totalDays);
  const [split, setSplit] = useState(() => allocation(answers));
  const [error, setError] = useState<string>();
  const multi = answers.destinations.length > 1;

  const length = mode === 'dates' ? (start && end ? daysBetween(start, end) : 0) : total;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'dates') {
      if (!start || !end) {
        setError(t('wizard.dates.missing'));
        return;
      }
      if (start < todayIso()) {
        setError(t('wizard.dates.past'));
        return;
      }
      if (end < start) {
        setError(t('wizard.dates.order'));
        return;
      }
    }
    if (length < 1 || length > MAX_DAYS) {
      setError(t('wizard.dates.length', { max: MAX_DAYS }));
      return;
    }
    const days = multi ? split : [length];
    if (days.reduce((a, b) => a + b, 0) !== length || days.some((d) => d < 1)) {
      {
        setError(t('wizard.dates.split', { total: length }));
        return;
      }
    }
    onNext({
      dateMode: mode,
      startDate: start,
      endDate: end,
      totalDays: length,
      daysPerDestination: days,
    });
  }

  return (
    <StepForm
      title={t('wizard.dates.title')}
      hint={t('wizard.dates.hint')}
      onSubmit={submit}
      onBack={onBack}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t('wizard.dates.modeLegend')}</legend>
        <ChoiceCard
          name="dateMode"
          value="dates"
          checked={mode === 'dates'}
          onChange={() => {
            setMode('dates');
          }}
          title={t('wizard.dates.byDates')}
          body={t('wizard.dates.byDatesHint')}
        />
        <ChoiceCard
          name="dateMode"
          value="days"
          checked={mode === 'days'}
          onChange={() => {
            setMode('days');
          }}
          title={t('wizard.dates.byDays')}
          body={t('wizard.dates.byDaysHint')}
        />
      </fieldset>

      {mode === 'dates' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-medium">{t('wizard.dates.start')}</span>
            <input
              type="date"
              value={start}
              min={todayIso()}
              onChange={(e) => {
                setStart(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              aria-describedby="dates-error"
            />
          </label>
          <label className="block">
            <span className="font-medium">{t('wizard.dates.end')}</span>
            <input
              type="date"
              value={end}
              min={start || todayIso()}
              onChange={(e) => {
                setEnd(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              aria-describedby="dates-error"
            />
          </label>
        </div>
      ) : (
        <label className="block max-w-xs">
          <span className="font-medium">{t('wizard.dates.days')}</span>
          <input
            type="number"
            min={1}
            max={MAX_DAYS}
            value={total}
            onChange={(e) => {
              setTotal(Number(e.target.value));
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            aria-describedby="dates-error"
          />
        </label>
      )}

      {multi && length > 0 && (
        <fieldset>
          <legend className="font-medium">
            {t('wizard.dates.splitLegend', { total: length })}
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {answers.destinations.map((destination, index) => (
              <label key={destination.name + String(index)} className="block">
                <span className="text-sm text-slate-700">{destination.name}</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_DAYS}
                  value={split[index] ?? 1}
                  onChange={(e) => {
                    const next = [...split];
                    next[index] = Number(e.target.value);
                    setSplit(next);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {length > 0 && (
        <p className="text-sm text-slate-600">{t('wizard.dates.summary', { count: length })}</p>
      )}
      <FieldError id="dates-error" message={error} />
    </StepForm>
  );
}
