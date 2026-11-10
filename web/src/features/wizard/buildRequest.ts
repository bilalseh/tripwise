import { CreateTripRequestSchema } from '@tripwise/shared';

import type { WizardAnswers } from './wizardStore';

export const MAX_DAYS = 14;

export function daysBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function tripLength(answers: WizardAnswers): number {
  if (answers.dateMode === 'dates' && answers.startDate && answers.endDate) {
    return daysBetween(answers.startDate, answers.endDate);
  }
  return answers.totalDays;
}

/** Split days as evenly as possible, earlier destinations getting the extra days. */
export function splitDays(total: number, parts: number): number[] {
  if (parts < 1) return [];
  const base = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, index) => base + (index < total % parts ? 1 : 0));
}

/** The days per destination to use: the user's split when it adds up, else an even split. */
export function allocation(answers: WizardAnswers): number[] {
  const total = tripLength(answers);
  const given = answers.daysPerDestination;
  const fits =
    given.length === answers.destinations.length &&
    given.every((d) => d >= 1) &&
    given.reduce((a, b) => a + b, 0) === total;
  return fits ? given : splitDays(total, answers.destinations.length);
}

export function defaultTitle(answers: WizardAnswers): string {
  return answers.destinations.map((d) => d.name).join(' · ');
}

/** Turn the answers into the API request, validated by the schema generated from Pydantic. */
export function buildRequest(answers: WizardAnswers) {
  const days = allocation(answers);
  const body = {
    title: answers.title.trim() || defaultTitle(answers),
    request: {
      destinations: answers.destinations.map((d, index) => ({ ...d, days: days[index] ?? 1 })),
      startDate: answers.dateMode === 'dates' && answers.startDate ? answers.startDate : null,
      travelers: {
        party: answers.party,
        adults: answers.adults,
        children: answers.party === 'family' ? answers.children : 0,
      },
      budgetLevel: answers.budgetLevel,
      budgetAmount: answers.budgetAmount,
      currency: answers.currency,
      interests: answers.interests,
      pace: answers.pace,
      constraints: {
        mobility: answers.mobility,
        dietary: answers.dietary,
        mustSee: answers.mustSee,
        notes: answers.notes.trim(),
      },
    },
  };
  return CreateTripRequestSchema.safeParse(body);
}
