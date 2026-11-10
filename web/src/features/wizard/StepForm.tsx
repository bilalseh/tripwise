import type { ReactNode, SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';

interface StepFormProps {
  title: string;
  hint?: string;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  onBack?: (() => void) | undefined;
  nextLabel?: string;
  busy?: boolean;
  children: ReactNode;
}

/** One question per screen: a heading, the fields, and Back/Next. */
export function StepForm({
  title,
  hint,
  onSubmit,
  onBack,
  nextLabel,
  busy,
  children,
}: StepFormProps) {
  const { t } = useTranslation();
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
      <div>
        <h1
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight sm:text-3xl"
          data-step-heading
        >
          {title}
        </h1>
        {hint && <p className="mt-2 text-slate-600">{hint}</p>}
      </div>
      {children}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            {t('wizard.back')}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="lg" disabled={busy}>
          {nextLabel ?? t('wizard.next')}
        </Button>
      </div>
    </form>
  );
}

export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}

export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  body,
  type = 'radio',
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  body?: string;
  type?: 'radio' | 'checkbox';
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 accent-brand-700"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        {body && <span className="mt-0.5 block text-sm text-slate-600">{body}</span>}
      </span>
    </label>
  );
}
