import type {
  BudgetLevel,
  Destination,
  Dietary,
  Interest,
  Mobility,
  Pace,
  Party,
} from '@tripwise/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const STEPS = [
  'destination',
  'dates',
  'travelers',
  'budget',
  'interests',
  'pace',
  'constraints',
  'review',
] as const;
export type StepId = (typeof STEPS)[number];

export interface WizardAnswers {
  destinations: Omit<Destination, 'days'>[];
  dateMode: 'dates' | 'days';
  startDate: string;
  endDate: string;
  totalDays: number;
  daysPerDestination: number[];
  party: Party;
  adults: number;
  children: number;
  budgetLevel: BudgetLevel;
  currency: string;
  budgetAmount: number | null;
  interests: Interest[];
  pace: Pace;
  mobility: Mobility;
  dietary: Dietary[];
  mustSee: string[];
  notes: string;
  title: string;
}

export const initialAnswers = (currency = 'EUR'): WizardAnswers => ({
  destinations: [],
  dateMode: 'dates',
  startDate: '',
  endDate: '',
  totalDays: 3,
  daysPerDestination: [],
  party: 'couple',
  adults: 2,
  children: 0,
  budgetLevel: 'moderate',
  currency,
  budgetAmount: null,
  interests: [],
  pace: 'balanced',
  mobility: 'none',
  dietary: [],
  mustSee: [],
  notes: '',
  title: '',
});

interface WizardState {
  step: number;
  answers: WizardAnswers;
  update: (patch: Partial<WizardAnswers>) => void;
  goTo: (step: number) => void;
  reset: (currency?: string) => void;
}

/** Answers survive Back/Next and a page reload (sessionStorage), never another visitor. */
export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      step: 0,
      answers: initialAnswers(),
      update: (patch) => {
        set((state) => ({ answers: { ...state.answers, ...patch } }));
      },
      goTo: (step) => {
        set({ step: Math.max(0, Math.min(STEPS.length - 1, step)) });
      },
      reset: (currency) => {
        set({ step: 0, answers: initialAnswers(currency) });
      },
    }),
    { name: 'tripwise.wizard', storage: createJSONStorage(() => sessionStorage), version: 1 },
  ),
);
