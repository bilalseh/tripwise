import type { BudgetLevel, Party } from '@tripwise/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { CURRENCIES } from '../../../lib/currencies';
import { ChoiceCard, FieldError, StepForm } from '../StepForm';
import type { StepProps } from './DestinationStep';

const PARTIES: Party[] = ['solo', 'couple', 'family', 'friends'];
const LEVELS: BudgetLevel[] = ['budget', 'moderate', 'luxury'];

const travelersSchema = z
  .object({
    party: z.enum(['solo', 'couple', 'family', 'friends']),
    adults: z
      .number()
      .int()
      .min(1, 'wizard.travelers.adultsMin')
      .max(12, 'wizard.travelers.adultsMax'),
    children: z.number().int().min(0).max(10, 'wizard.travelers.childrenMax'),
  })
  .refine((v) => v.party !== 'family' || v.children >= 1, {
    path: ['children'],
    message: 'wizard.travelers.familyNeedsChild',
  })
  .refine((v) => v.party !== 'friends' || v.adults >= 2, {
    path: ['adults'],
    message: 'wizard.travelers.friendsNeedTwo',
  });

export function TravelersStep({ answers, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, setValue, getValues, control, formState } = useForm({
    resolver: zodResolver(travelersSchema),
    defaultValues: { party: answers.party, adults: answers.adults, children: answers.children },
  });
  const party = useWatch({ control, name: 'party' });

  function choose(next: Party) {
    setValue('party', next);
    if (next === 'solo') setValue('adults', 1);
    if (next === 'couple') setValue('adults', 2);
    if (next !== 'family') setValue('children', 0);
    if (next === 'family' && getValues('children') < 1) setValue('children', 1);
  }

  const adultsError = formState.errors.adults?.message;
  const childrenError = formState.errors.children?.message;
  return (
    <StepForm
      title={t('wizard.travelers.title')}
      onSubmit={(e) =>
        void handleSubmit((v) => {
          onNext(v);
        })(e)
      }
      onBack={onBack}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t('wizard.travelers.title')}</legend>
        {PARTIES.map((value) => (
          <ChoiceCard
            key={value}
            name="party"
            value={value}
            checked={party === value}
            onChange={() => {
              choose(value);
            }}
            title={t(`wizard.travelers.party.${value}`)}
            body={t(`wizard.travelers.partyHint.${value}`)}
          />
        ))}
      </fieldset>
      {(party === 'family' || party === 'friends') && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-medium">{t('wizard.travelers.adults')}</span>
            <input
              type="number"
              {...register('adults', { valueAsNumber: true })}
              aria-invalid={Boolean(adultsError)}
              aria-describedby="adults-error"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <FieldError
              id="adults-error"
              message={adultsError && t(adultsError as 'wizard.travelers.adultsMin')}
            />
          </label>
          {party === 'family' && (
            <label className="block">
              <span className="font-medium">{t('wizard.travelers.children')}</span>
              <input
                type="number"
                {...register('children', { valueAsNumber: true })}
                aria-invalid={Boolean(childrenError)}
                aria-describedby="children-error"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <FieldError
                id="children-error"
                message={childrenError && t(childrenError as 'wizard.travelers.childrenMax')}
              />
            </label>
          )}
        </div>
      )}
    </StepForm>
  );
}

const budgetSchema = z.object({
  budgetLevel: z.enum(['budget', 'moderate', 'luxury']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  budgetAmount: z
    .union([
      z.nan(),
      z.number().positive('wizard.budget.amountPositive').max(1_000_000, 'wizard.budget.amountMax'),
    ])
    .optional(),
});

export function BudgetStep({ answers, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, setValue, control, formState } = useForm({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      budgetLevel: answers.budgetLevel,
      currency: answers.currency,
      budgetAmount: answers.budgetAmount ?? Number.NaN,
    },
  });
  const level = useWatch({ control, name: 'budgetLevel' });
  const amountError = formState.errors.budgetAmount?.message;

  return (
    <StepForm
      title={t('wizard.budget.title')}
      hint={t('wizard.budget.hint')}
      onBack={onBack}
      onSubmit={(e) =>
        void handleSubmit((v) => {
          const amount = v.budgetAmount;
          onNext({
            budgetLevel: v.budgetLevel,
            currency: v.currency,
            budgetAmount: amount !== undefined && !Number.isNaN(amount) ? amount : null,
          });
        })(e)
      }
    >
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t('wizard.budget.levelLegend')}</legend>
        {LEVELS.map((value) => (
          <ChoiceCard
            key={value}
            name="budgetLevel"
            value={value}
            checked={level === value}
            onChange={() => {
              setValue('budgetLevel', value);
            }}
            title={t(`wizard.budget.level.${value}`)}
            body={t(`wizard.budget.levelHint.${value}`)}
          />
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">{t('wizard.budget.currency')}</span>
          <select
            {...register('currency')}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-medium">{t('wizard.budget.amount')}</span>
          <input
            type="number"
            inputMode="decimal"
            {...register('budgetAmount', { valueAsNumber: true })}
            aria-invalid={Boolean(amountError)}
            aria-describedby="amount-hint amount-error"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <span id="amount-hint" className="mt-1 block text-sm text-slate-600">
            {t('wizard.budget.amountHint')}
          </span>
          <FieldError
            id="amount-error"
            message={amountError && t(amountError as 'wizard.budget.amountPositive')}
          />
        </label>
      </div>
    </StepForm>
  );
}
