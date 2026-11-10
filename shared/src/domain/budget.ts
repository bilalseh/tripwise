import type { BudgetCategory, BudgetOverride, Day } from '../generated/types';

export const CATEGORIES: readonly BudgetCategory[] = ['stay', 'food', 'transport', 'activities'];

export interface CategoryAmount {
  category: BudgetCategory;
  estimate: number;
  override: number | null;
  /** The override when there is one, else the estimate. */
  amount: number;
}

export interface DayBudget {
  day: number;
  categories: CategoryAmount[];
  total: number;
}

export type BudgetStatus = 'under' | 'near' | 'over' | 'unset';

export interface TripBudget {
  days: DayBudget[];
  byCategory: Record<BudgetCategory, number>;
  total: number;
  limit: number | null;
  /** total / limit, or null without a limit. */
  ratio: number | null;
  status: BudgetStatus;
}

/** Food stops count as food, every other stop as activities. */
function estimates(day: Day): Record<BudgetCategory, number> {
  let food = day.estimates.food;
  let activities = 0;
  for (const stop of day.stops) {
    if (stop.category === 'food') food += stop.costEstimate;
    else activities += stop.costEstimate;
  }
  return { stay: day.estimates.stay, food, transport: day.estimates.transport, activities };
}

export function dayBudget(
  day: Day,
  dayIndex: number,
  overrides: readonly BudgetOverride[],
): DayBudget {
  const estimated = estimates(day);
  const categories = CATEGORIES.map((category) => {
    const override = overrides.find((o) => o.day === dayIndex && o.category === category);
    const estimate = estimated[category];
    return {
      category,
      estimate,
      override: override?.amount ?? null,
      amount: override?.amount ?? estimate,
    };
  });
  return { day: dayIndex, categories, total: sum(categories.map((c) => c.amount)) };
}

const NEAR = 0.9;

export function tripBudget(
  days: readonly Day[],
  overrides: readonly BudgetOverride[],
  limit: number | null,
): TripBudget {
  const perDay = days.map((day, index) => dayBudget(day, index, overrides));
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      sum(perDay.map((d) => d.categories.find((c) => c.category === category)?.amount ?? 0)),
    ]),
  ) as Record<BudgetCategory, number>;
  const total = sum(perDay.map((d) => d.total));
  const ratio = limit ? total / limit : null;
  const status: BudgetStatus =
    ratio === null ? 'unset' : ratio > 1 ? 'over' : ratio >= NEAR ? 'near' : 'under';
  return { days: perDay, byCategory, total, limit, ratio, status };
}

/** Set (or with null, clear) the user's own number for a day and category. */
export function setOverride(
  overrides: readonly BudgetOverride[],
  day: number,
  category: BudgetCategory,
  amount: number | null,
): BudgetOverride[] {
  const rest = overrides.filter((o) => !(o.day === day && o.category === category));
  return amount === null ? rest : [...rest, { day, category, amount: Math.max(0, amount) }];
}

function sum(values: readonly number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}
